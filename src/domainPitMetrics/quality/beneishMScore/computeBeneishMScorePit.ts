import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getBalanceSheetXbrlFirst as getQuarterlyBalanceSheet } from '@/shared/sourceData/balanceSheetXbrlFirst';
import { getIncomeStatementXbrlFirst as getQuarterlyIncomeStatement } from '@/shared/sourceData/incomeStatementXbrlFirst';
import { getCashFlowStatementXbrlFirst as getQuarterlyCashFlowStatement } from '@/shared/sourceData/cashFlowStatementXbrlFirst';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate, type KnowledgeDateResolution } from '../../knowledgeDate';

import { writeMetricValue, type MetricValueWriteOutcome, periodTypeGroup } from '../../metricValueWriter';
import type { MetricNullReason } from '../../metricBasis';
import { isFinancialIndustryCompany } from '@/shared/sourceData/securitiesIndustry';

// 這份檔案是 src/domainMetrics/beneishMScore.ts 的獨立重新實作。8 個變量（DSRI/GMI/AQI/
// SGI/DEPI/SGAI/TATA/LVGI）本季 vs 去年同季比較，去年同季座標比照 piotroskiFScore 用
// getPastNQuarters({rocYear,season},5)[0]。TATA（應計項目）本質上是單期指標，不需要比較，
// 其餘 7 個都是「本期比率 / 去年同期比率」的指數。
// 2026-09-13：抽出 resolveBeneishMScoreInputs()，回傳全部 8 個變量，供 beneishAqi/
// beneishDsri 兩個新 metric_code（見各自資料夾）共用同一份計算——這兩個是量化選股盤點
// 使用者要求曝露的既有中間變量，不是重新推導，寫入路徑（computeAndWriteBeneishMScorePit）
// 本身行為完全不變，只是內部改呼叫這個 resolver。

const pickNetIncome = (
  record: { netIncomeAttributableToParent: bigint | null; netIncome: bigint | null } | null
): { value: bigint | null } => {
  if (!record) return { value: null };
  if (record.netIncomeAttributableToParent !== null) return { value: record.netIncomeAttributableToParent };
  if (record.netIncome !== null) return { value: record.netIncome };
  return { value: null };
};

const ratio = (numerator: bigint | null, denominator: bigint | null): number | null => {
  if (numerator === null || denominator === null || denominator === 0n) return null;
  return Number(numerator) / Number(denominator);
};

const divide = (numerator: number | null, denominator: number | null): number | null => {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return numerator / denominator;
};

export interface QuarterData {
  accountsReceivable: bigint | null;
  operatingRevenue: bigint | null;
  grossProfit: bigint | null;
  currentAssets: bigint | null;
  totalAssets: bigint | null;
  propertyPlantEquipment: bigint | null;
  sellingExpenses: bigint | null;
  adminExpenses: bigint | null;
  totalLiabilities: bigint | null;
  depreciation: bigint | null;
  netIncome: bigint | null;
  operatingCashFlow: bigint | null;
  reportDate: Date | null;
  available: boolean;
}

const fetchQuarterData = async (symbol: string, rocYear: number, season: number, dataType: string, subsidiaryCompanyId: string): Promise<QuarterData> => {
  const key = { symbol, year: rocYear, quarter: season, dataType, subsidiaryCompanyId };
  const [balanceSheet, incomeStatement, cashFlowStatement] = await Promise.all([
    getQuarterlyBalanceSheet(key),
    getQuarterlyIncomeStatement(key),
    getQuarterlyCashFlowStatement(key),
  ]);
  const reportDate = balanceSheet?.reportDate ?? incomeStatement?.reportDate ?? cashFlowStatement?.reportDate ?? null;

  return {
    accountsReceivable: balanceSheet?.accountsReceivable ?? null,
    operatingRevenue: incomeStatement?.operatingRevenue ?? null,
    grossProfit: incomeStatement?.grossProfit ?? null,
    currentAssets: balanceSheet?.currentAssets ?? null,
    totalAssets: balanceSheet?.totalAssets ?? null,
    propertyPlantEquipment: balanceSheet?.propertyPlantEquipment ?? null,
    sellingExpenses: incomeStatement?.sellingExpenses ?? null,
    adminExpenses: incomeStatement?.adminExpenses ?? null,
    totalLiabilities: balanceSheet?.totalLiabilities ?? null,
    depreciation: cashFlowStatement?.depreciation ?? null,
    netIncome: pickNetIncome(incomeStatement).value,
    operatingCashFlow: cashFlowStatement?.netCashFromOperatingActivities ?? null,
    reportDate,
    available: balanceSheet !== null && incomeStatement !== null && cashFlowStatement !== null,
  };
};

const assetQuality = (data: QuarterData): number | null => {
  if (data.totalAssets === null || data.currentAssets === null || data.propertyPlantEquipment === null) return null;
  return ratio(data.totalAssets - data.currentAssets - data.propertyPlantEquipment, data.totalAssets);
};

const depreciationRate = (data: QuarterData): number | null => {
  if (data.depreciation === null || data.propertyPlantEquipment === null) return null;
  return ratio(data.depreciation, data.depreciation + data.propertyPlantEquipment);
};

const sgaRatio = (data: QuarterData): number | null => {
  if (data.sellingExpenses === null || data.adminExpenses === null) return null;
  return ratio(data.sellingExpenses + data.adminExpenses, data.operatingRevenue);
};

type BasisOutcome = MetricValueWriteOutcome | { action: 'skipped_no_knowledge_date' } | { action: 'skipped_no_quarter' };

export interface BeneishMScorePitOutcome {
  symbol: string;
  rocYear: string | null;
  season: string | null;
  q: BasisOutcome;
}

export interface BeneishMScoreResolution {
  symbol: string;
  rocYear: string;
  season: string;
  fiscalYear: number;
  fiscalQuarter: number;
  dsri: number | null;
  gmi: number | null;
  aqi: number | null;
  sgi: number | null;
  depi: number | null;
  sgai: number | null;
  tata: number | null;
  lvgi: number | null;
  mScore: number | null;
  prevAvailable: boolean;
  mainAnchor: KnowledgeDateResolution | null;
  isFinancial: boolean;
  curr: QuarterData;
  prev: QuarterData;
  priorRocYear: number;
  priorSeason: number;
}

// 算出 8 個變量 + mScore 本身，不寫入——beneishMScore/beneishAqi/beneishDsri 三個
// metric_code 的寫入路徑（下面三支 computeAndWriteXxxPit）都呼叫這支，各自只挑自己
// 要的變量寫進 metric_value，避免重複查三次原始財報。
export const resolveBeneishMScoreInputs = async (query: QuarterlyMetricQuery): Promise<BeneishMScoreResolution | null> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['balanceSheet', 'incomeStatement', 'cashFlowStatement']);

  if (!resolvedQuarter) return null;

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const prior = getPastNQuarters({ rocYear, season: season as Season }, 5)[0]!;
  const priorRocYear = Number(prior.year);
  const priorSeasonNum = Number(prior.season);

  const [curr, prev] = await Promise.all([
    fetchQuarterData(symbol, rocYear, seasonNum, dataType, subsidiaryCompanyId),
    fetchQuarterData(symbol, priorRocYear, priorSeasonNum, dataType, subsidiaryCompanyId),
  ]);

  const currArRatio = ratio(curr.accountsReceivable, curr.operatingRevenue);
  const prevArRatio = ratio(prev.accountsReceivable, prev.operatingRevenue);
  const currGrossMargin = ratio(curr.grossProfit, curr.operatingRevenue);
  const prevGrossMargin = ratio(prev.grossProfit, prev.operatingRevenue);
  const currAssetQuality = assetQuality(curr);
  const prevAssetQuality = assetQuality(prev);
  const currDepRate = depreciationRate(curr);
  const prevDepRate = depreciationRate(prev);
  const currSgaRatio = sgaRatio(curr);
  const prevSgaRatio = sgaRatio(prev);
  const currLeverage = ratio(curr.totalLiabilities, curr.totalAssets);
  const prevLeverage = ratio(prev.totalLiabilities, prev.totalAssets);

  const dsri = divide(currArRatio, prevArRatio);
  const gmi = divide(prevGrossMargin, currGrossMargin);
  const aqi = divide(currAssetQuality, prevAssetQuality);
  const sgi = ratio(curr.operatingRevenue, prev.operatingRevenue);
  const depi = divide(prevDepRate, currDepRate);
  const sgai = divide(currSgaRatio, prevSgaRatio);
  const tata = curr.netIncome !== null && curr.operatingCashFlow !== null ? ratio(curr.netIncome - curr.operatingCashFlow, curr.totalAssets) : null;
  const lvgi = divide(currLeverage, prevLeverage);

  const variables = [dsri, gmi, aqi, sgi, depi, sgai, tata, lvgi];
  const allEvaluated = variables.every((v) => v !== null);
  const mScore = allEvaluated
    ? Math.round((-4.84 + 0.92 * dsri! + 0.528 * gmi! + 0.404 * aqi! + 0.892 * sgi! + 0.115 * depi! - 0.172 * sgai! + 4.037 * tata! + 0.0327 * lvgi!) * 10000) / 10000
    : null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [
    { rocYear, season: seasonNum, reportDate: curr.reportDate },
    { rocYear: priorRocYear, season: priorSeasonNum, reportDate: prev.reportDate },
  ]);

  const isFinancial = await isFinancialIndustryCompany(symbol);

  return {
    symbol,
    rocYear: year,
    season,
    fiscalYear,
    fiscalQuarter: seasonNum,
    dsri,
    gmi,
    aqi,
    sgi,
    depi,
    sgai,
    tata,
    lvgi,
    mScore,
    prevAvailable: prev.available,
    mainAnchor,
    isFinancial,
    curr,
    prev,
    priorRocYear,
    priorSeason: priorSeasonNum,
  };
};

// 單一變量的 nullReason 判斷，三個 metric_code 共用同一套規則：模型不適用金融保險業
// 一律 not_applicable_industry；其餘情況下該變量算不出來，去年同季資料整組缺席算
// insufficient_history，否則算 missing_input——跟原本 mScore 的判斷邏輯一致，只是
// 套用到單一變量而不是要求 8 個全部到齊。
const resolveVariableNullReason = (value: number | null, resolution: BeneishMScoreResolution): MetricNullReason | null => {
  if (resolution.isFinancial) return 'not_applicable_industry';
  if (value !== null) return null;
  return !resolution.prevAvailable ? 'insufficient_history' : 'missing_input';
};

export const computeAndWriteBeneishMScorePit = async (query: QuarterlyMetricQuery): Promise<BeneishMScorePitOutcome> => {
  const resolution = await resolveBeneishMScoreInputs(query);
  if (!resolution) {
    return { symbol: query.symbol, rocYear: null, season: null, q: { action: 'skipped_no_quarter' } };
  }

  const { symbol, rocYear, season, fiscalYear, fiscalQuarter, mainAnchor } = resolution;
  const mScore = resolution.isFinancial ? null : resolution.mScore;
  const nullReason = resolveVariableNullReason(resolution.mScore, resolution);

  let q: BasisOutcome;
  if (!mainAnchor) {
    q = { action: 'skipped_no_knowledge_date' };
  } else {
    q = await writeMetricValue({
      symbol,
      metricCode: 'beneishMScore',
      fiscalYear,
      fiscalQuarter,
      dataType: query.dataType,
      subsidiaryCompanyId: query.subsidiaryCompanyId,
      ...periodTypeGroup('Q'),
      value: mScore,
      nullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  }

  return { symbol, rocYear, season, q };
};

export { resolveVariableNullReason };
export type { BasisOutcome };
