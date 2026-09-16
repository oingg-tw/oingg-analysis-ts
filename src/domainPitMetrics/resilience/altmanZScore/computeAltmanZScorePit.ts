import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { toRatio4 } from '@/domainPitMetrics/shared/numericHelpers';
import { getBalanceSheetXbrlFirst as getQuarterlyBalanceSheet } from '@/infrastructure/repositories/mops/balanceSheetXbrlFirst';
import { getIncomeStatementXbrlFirst as getQuarterlyIncomeStatement, type IncomeStatementFields } from '@/infrastructure/repositories/mops/incomeStatementXbrlFirst';
import { getMarketCapAsOf, type MarketCapAsOf } from '@/infrastructure/repositories/twse/marketCap';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate, type KnowledgeDateResolution } from '../../knowledgeDate';

import { writeMetricValue, periodTypeGroup } from '../../metricValueWriter';
import type { BasisOutcome, StandardBasisPitOutcome } from '../../pitOutcome';
import type { MetricNullReason } from '../../metricBasis';
import { isFinancialIndustryCompany } from '@/infrastructure/repositories/exchange/securitiesIndustry';

// 這份檔案是 src/domainMetrics/altmanZScore.ts 的獨立重新實作——舊架構呼叫
// calculateInterestCoverage()（取 EBIT-TTM）+ calculateTurnoverRatio()（取 assetTurnoverTtm
// 當 X5），這裡不依賴 interestCoverage/assetTurnover 這兩個 metric_code 已寫入的值，自己
// 重新查資產負債表+損益表算 EBIT-TTM 跟 X5。市值查詢複用 resolveKnowledgeDate 的
// knowledge_date，跟第四批 psr/pFcf/evEbitda 同一個套路。只有 TTM 一種 basis——X3/X5
// 都需要 TTM 資料才算得出來。原始版模型的產業適用性限制（用上市製造業樣本校準）只在舊架構
// warnings 呈現，metric_value 沒有 warnings 欄位，這裡不重複記錄。
//
// 2026-09-11：抽出 resolveAltmanZScoreInputs()，回傳 X1-X5 五個係數各自用到的原始欄位
// （附帶 fieldKey），給 getAltmanZScoreProvenance.ts（GET /companies/:symbol/
// metric-provenance 的 altmanZScore 試點）共用，寫入路徑（computeAndWriteAltmanZScorePit）
// 本身行為完全不變，只是內部改呼叫這個 resolver。

export interface AltmanZScoreTtmQuarterDetail {
  rocYear: number;
  season: number;
  fiscalYear: number;
  profitBeforeTax: bigint | null;
  financeCosts: bigint | null;
  operatingRevenue: bigint | null;
  reportDate: Date | null;
}

export interface AltmanZScoreResolution {
  symbol: string;
  rocYear: string;
  season: string;
  fiscalYear: number;
  fiscalQuarter: number;
  totalAssets: bigint | null;
  totalLiabilities: bigint | null;
  currentAssets: bigint | null;
  currentLiabilities: bigint | null;
  retainedEarnings: bigint | null;
  reportDate: Date | null;
  x1: number | null;
  x2: number | null;
  marketCap: MarketCapAsOf | null;
  x4: number | null;
  ttmQuarterDetails: AltmanZScoreTtmQuarterDetail[];
  ttmComplete: boolean;
  x3: number | null;
  x5: number | null;
  zScore: number | null;
  nullReason: MetricNullReason | null;
  mainAnchor: KnowledgeDateResolution | null;
}

export const resolveAltmanZScoreInputs = async (query: QuarterlyMetricQuery): Promise<AltmanZScoreResolution | null> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet', 'incomeStatement']);

  if (!resolvedQuarter) return null;

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const balanceSheet = await getQuarterlyBalanceSheet(key);
  const totalAssets = balanceSheet?.totalAssets ?? null;
  const totalLiabilities = balanceSheet?.totalLiabilities ?? null;
  const currentAssets = balanceSheet?.currentAssets ?? null;
  const currentLiabilities = balanceSheet?.currentLiabilities ?? null;
  const retainedEarnings = balanceSheet?.retainedEarnings ?? null;
  const reportDate = balanceSheet?.reportDate ?? null;

  const x1 = currentAssets !== null && currentLiabilities !== null && totalAssets !== null ? toRatio4(currentAssets - currentLiabilities, totalAssets) : null;
  const x2 = retainedEarnings !== null && totalAssets !== null ? toRatio4(retainedEarnings, totalAssets) : null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);
  const marketCap = mainAnchor ? await getMarketCapAsOf(symbol, mainAnchor.knowledgeDate) : null;
  const x4 = marketCap !== null && totalLiabilities !== null ? Math.round((marketCap.marketCap / (Number(totalLiabilities) * 1000)) * 10000) / 10000 : null;

  // X3/X5：近四季（含本季）EBIT/營收各自加總，分母固定用本季期末總資產。
  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords: (IncomeStatementFields | null)[] = await Promise.all(
    ttmQuarters.map((tq) => getQuarterlyIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );

  const ttmQuarterDetails: AltmanZScoreTtmQuarterDetail[] = ttmQuarters.map((tq, i) => ({
    rocYear: Number(tq.year),
    season: Number(tq.season),
    fiscalYear: rocYearToGregorian(Number(tq.year)),
    profitBeforeTax: ttmRecords[i]?.profitBeforeTax ?? null,
    financeCosts: ttmRecords[i]?.financeCosts ?? null,
    operatingRevenue: ttmRecords[i]?.operatingRevenue ?? null,
    reportDate: ttmRecords[i]?.reportDate ?? null,
  }));

  let ebitTtmSum = 0n;
  let revenueTtmSum = 0n;
  let ttmComplete = true;
  for (const detail of ttmQuarterDetails) {
    if (detail.profitBeforeTax === null || detail.financeCosts === null || detail.operatingRevenue === null) {
      ttmComplete = false;
    } else {
      ebitTtmSum += detail.profitBeforeTax + detail.financeCosts;
      revenueTtmSum += detail.operatingRevenue;
    }
  }

  const x3 = ttmComplete && totalAssets !== null ? toRatio4(ebitTtmSum, totalAssets) : null;
  const x5 = ttmComplete && totalAssets !== null ? toRatio4(revenueTtmSum, totalAssets) : null;

  let zScore = x1 !== null && x2 !== null && x3 !== null && x4 !== null && x5 !== null ? Math.round((1.2 * x1 + 1.4 * x2 + 3.3 * x3 + 0.6 * x4 + 0.999 * x5) * 100) / 100 : null;

  let nullReason: MetricNullReason | null = null;
  if (zScore === null) {
    nullReason = !ttmComplete ? 'insufficient_history' : 'missing_input';
  }

  // 2026-09-13：模型本身不適用金融保險業（見 isFinancialIndustryCompany 的說明），
  // 蓋過原本算出來的結果，不是資料缺漏。
  if (await isFinancialIndustryCompany(symbol)) {
    zScore = null;
    nullReason = 'not_applicable_industry';
  }

  return {
    symbol,
    rocYear: year,
    season,
    fiscalYear,
    fiscalQuarter: seasonNum,
    totalAssets,
    totalLiabilities,
    currentAssets,
    currentLiabilities,
    retainedEarnings,
    reportDate,
    x1,
    x2,
    marketCap,
    x4,
    ttmQuarterDetails,
    ttmComplete,
    x3,
    x5,
    zScore,
    nullReason,
    mainAnchor,
  };
};

export type AltmanZScorePitOutcome = StandardBasisPitOutcome;

export const computeAndWriteAltmanZScorePit = async (query: QuarterlyMetricQuery): Promise<AltmanZScorePitOutcome> => {
  const resolution = await resolveAltmanZScoreInputs(query);
  if (!resolution) {
    return { symbol: query.symbol, rocYear: null, season: null, ttm: { action: 'skipped_no_quarter' } };
  }

  const { symbol, rocYear, season, fiscalYear, fiscalQuarter, zScore, nullReason, ttmComplete, ttmQuarterDetails, mainAnchor } = resolution;
  const coordinateBase = { symbol, metricCode: 'altmanZScore', fiscalYear, fiscalQuarter, dataType: query.dataType, subsidiaryCompanyId: query.subsidiaryCompanyId };

  let ttm: BasisOutcome;
  if (!mainAnchor) {
    ttm = { action: 'skipped_no_knowledge_date' };
  } else if (ttmComplete) {
    const ttmAnchor = await resolveKnowledgeDate(
      symbol,
      ttmQuarterDetails.map((detail) => ({ rocYear: detail.rocYear, season: detail.season, reportDate: detail.reportDate }))
    );
    if (!ttmAnchor) {
      ttm = { action: 'skipped_no_knowledge_date' };
    } else {
      ttm = await writeMetricValue({
        ...coordinateBase,
        ...periodTypeGroup('TTM'),
        value: zScore,
        nullReason,
        knowledgeDate: ttmAnchor.knowledgeDate,
        knowledgeDateIsFallback: ttmAnchor.isFallback,
      });
    }
  } else {
    ttm = await writeMetricValue({
      ...coordinateBase,
      ...periodTypeGroup('TTM'),
      value: null,
      // 這個分支代表 ttmComplete 是 false，正常情況一律是 insufficient_history；
      // 但金融保險業在 resolveAltmanZScoreInputs 已經把 nullReason 蓋成
      // not_applicable_industry（模型本身不適用，優先權比資料缺漏高），這裡沿用
      // resolution 算好的 nullReason，不要重新硬寫死 'insufficient_history'。
      nullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  }

  return { symbol, rocYear, season, ttm };
};
