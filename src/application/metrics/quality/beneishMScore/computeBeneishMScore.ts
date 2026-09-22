import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { pickNetIncome } from '@/domain/metrics/shared/pickers';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate, type KnowledgeDateResolution } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { computation, type ComputationBatch, type ComputationSlot, noQuarterBatch } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';

// 這份檔案是 src/domainMetrics/beneishMScore.ts 的獨立重新實作。8 個變量（DSRI/GMI/AQI/
// SGI/DEPI/SGAI/TATA/LVGI）本季 vs 去年同季比較，去年同季座標比照 piotroskiFScore 用
// getPastNQuarters({rocYear,season},5)[0]。TATA（應計項目）本質上是單期指標，不需要比較，
// 其餘 7 個都是「本期比率 / 去年同期比率」的指數。
// 2026-09-13：抽出 resolveBeneishMScoreInputs()，回傳全部 8 個變量，供 beneishAqi/
// beneishDsri 兩個新 metric_code（見各自資料夾）共用同一份計算——這兩個是量化選股盤點
// 使用者要求曝露的既有中間變量，不是重新推導，寫入路徑（computeAndWriteBeneishMScorePit）
// 本身行為完全不變，只是內部改呼叫這個 resolver。

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

const fetchQuarterData = async (
  symbol: string,
  rocYear: number,
  season: number,
  dataType: string,
  subsidiaryCompanyId: string,
  deps: BeneishMScoreDeps
): Promise<QuarterData> => {
  const key = { symbol, year: rocYear, quarter: season, dataType, subsidiaryCompanyId };
  const [balanceSheet, incomeStatement, cashFlowStatement] = await Promise.all([
    deps.statements.getBalanceSheet(key),
    deps.statements.getIncomeStatement(key),
    deps.statements.getCashFlowStatement(key),
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
export const resolveBeneishMScoreInputs = async (
  query: QuarterlyMetricQuery,
  deps: BeneishMScoreDeps
): Promise<BeneishMScoreResolution | null> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet', 'incomeStatement', 'cashFlowStatement'], deps.quarters);

  if (!resolvedQuarter) return null;

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const prior = getPastNQuarters({ rocYear, season: season as Season }, 5)[0]!;
  const priorRocYear = Number(prior.year);
  const priorSeasonNum = Number(prior.season);

  const [curr, prev] = await Promise.all([
    fetchQuarterData(symbol, rocYear, seasonNum, dataType, subsidiaryCompanyId, deps),
    fetchQuarterData(symbol, priorRocYear, priorSeasonNum, dataType, subsidiaryCompanyId, deps),
  ]);

  // 2026-09-22 formulaVersion 2（公式稽核）：TATA 改用近四季加總的 (淨利 − 營業現金流) / 本季期末總資產。Beneish (1999)
  // 是年度模型，係數 4.037 對應的是「一年的應計項目佔總資產比」；v1 用單季分子只有年度尺度的約 1/4，M-Score 系統性偏低。
  // 其餘 7 個變數都是「本期比率 ÷ 去年同期比率」的指數，尺度會互相抵消，維持單季 vs 去年同季。
  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map(async (tq) => {
      const k = { symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId };
      const [income, cashFlow] = await Promise.all([deps.statements.getIncomeStatement(k), deps.statements.getCashFlowStatement(k)]);
      return { netIncome: pickNetIncome(income).value, operatingCashFlow: cashFlow?.netCashFromOperatingActivities ?? null };
    })
  );
  const ttmAccrualsComplete = ttmRecords.every((r) => r.netIncome !== null && r.operatingCashFlow !== null);
  const accrualsTtm = ttmAccrualsComplete ? ttmRecords.reduce((sum, r) => sum + (r.netIncome! - r.operatingCashFlow!), 0n) : null;

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
  const tata = accrualsTtm !== null ? ratio(accrualsTtm, curr.totalAssets) : null;
  const lvgi = divide(currLeverage, prevLeverage);

  const variables = [dsri, gmi, aqi, sgi, depi, sgai, tata, lvgi];
  const allEvaluated = variables.every((v) => v !== null);
  const mScore = allEvaluated
    ? Math.round((-4.84 + 0.92 * dsri! + 0.528 * gmi! + 0.404 * aqi! + 0.892 * sgi! + 0.115 * depi! - 0.172 * sgai! + 4.037 * tata! + 0.0327 * lvgi!) * 10000) / 10000
    : null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [
    { rocYear, season: seasonNum, reportDate: curr.reportDate },
    { rocYear: priorRocYear, season: priorSeasonNum, reportDate: prev.reportDate },
  ], deps.announcements);

  const isFinancial = await deps.industry.isFinancialIndustryCompany(symbol);

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

export type BeneishMScoreDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'industry'>;

export const BENEISH_M_SCORE_FORMULA_VERSION = 2; // TATA 改 TTM，見 resolveBeneishMScoreInputs 內的說明。

export type BeneishMScoreComputationBatch = ComputationBatch<'q'>;

export const computeBeneishMScore = async (
  query: QuarterlyMetricQuery,
  deps: BeneishMScoreDeps
): Promise<BeneishMScoreComputationBatch> => {
  const resolution = await resolveBeneishMScoreInputs(query, deps);
  if (!resolution) {
    return noQuarterBatch(query.symbol, ['q']);
  }

  const { symbol, rocYear, season, fiscalYear, fiscalQuarter, mainAnchor } = resolution;
  const mScore = resolution.isFinancial ? null : resolution.mScore;
  const nullReason = resolveVariableNullReason(resolution.mScore, resolution);

  let q: ComputationSlot;
  if (!mainAnchor) {
    q = { action: 'skipped_no_knowledge_date' };
  } else {
    q = computation({
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
      formulaVersion: BENEISH_M_SCORE_FORMULA_VERSION,
    });
  }

  return { symbol, rocYear, season, slots: { q } };
};

export { resolveVariableNullReason };
