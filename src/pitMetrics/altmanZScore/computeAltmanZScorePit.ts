import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getBalanceSheetXbrlFirst as getQuarterlyBalanceSheet } from '@/shared/sourceData/balanceSheetXbrlFirst';
import { getIncomeStatementXbrlFirst as getQuarterlyIncomeStatement } from '@/shared/sourceData/incomeStatementXbrlFirst';
import { getMarketCapAsOf } from '@/shared/sourceData/marketCap';
import { getPastNQuarters, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../knowledgeDate';
import { rocYearToGregorian } from '../rocYear';
import { writeMetricValue, type MetricValueWriteOutcome } from '../metricValueWriter';
import type { MetricNullReason } from '../metricBasis';

// 這份檔案是 src/domainMetrics/altmanZScore.ts 的獨立重新實作——舊架構呼叫
// calculateInterestCoverage()（取 EBIT-TTM）+ calculateTurnoverRatio()（取 assetTurnoverTtm
// 當 X5），這裡不依賴 interestCoverage/assetTurnover 這兩個 metric_code 已寫入的值，自己
// 重新查資產負債表+損益表算 EBIT-TTM 跟 X5。市值查詢複用 resolveKnowledgeDate 的
// knowledge_date，跟第四批 psr/pFcf/evEbitda 同一個套路。只有 TTM 一種 basis——X3/X5
// 都需要 TTM 資料才算得出來。原始版模型的產業適用性限制（用上市製造業樣本校準）只在舊架構
// warnings 呈現，metric_value 沒有 warnings 欄位，這裡不重複記錄。

const toRatio4 = (numerator: bigint, denominator: bigint): number | null => {
  if (denominator === 0n) return null;
  return Math.round((Number(numerator) / Number(denominator)) * 10000) / 10000;
};

type BasisOutcome = MetricValueWriteOutcome | { action: 'skipped_no_knowledge_date' } | { action: 'skipped_no_quarter' };

export interface AltmanZScorePitOutcome {
  symbol: string;
  rocYear: string | null;
  season: string | null;
  ttm: BasisOutcome;
}

export const computeAndWriteAltmanZScorePit = async (query: QuarterlyMetricQuery): Promise<AltmanZScorePitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['balanceSheet', 'incomeStatement']);

  if (!resolvedQuarter) {
    return { symbol, rocYear: null, season: null, ttm: { action: 'skipped_no_quarter' } };
  }

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
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => getQuarterlyIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );

  let ebitTtmSum = 0n;
  let revenueTtmSum = 0n;
  let ttmComplete = true;
  for (const record of ttmRecords) {
    if (record === null || record.profitBeforeTax === null || record.financeCosts === null || record.operatingRevenue === null) {
      ttmComplete = false;
    } else {
      ebitTtmSum += record.profitBeforeTax + record.financeCosts;
      revenueTtmSum += record.operatingRevenue;
    }
  }

  const x3 = ttmComplete && totalAssets !== null ? toRatio4(ebitTtmSum, totalAssets) : null;
  const x5 = ttmComplete && totalAssets !== null ? toRatio4(revenueTtmSum, totalAssets) : null;

  const zScore = x1 !== null && x2 !== null && x3 !== null && x4 !== null && x5 !== null ? Math.round((1.2 * x1 + 1.4 * x2 + 3.3 * x3 + 0.6 * x4 + 0.999 * x5) * 100) / 100 : null;

  let nullReason: MetricNullReason | null = null;
  if (zScore === null) {
    nullReason = !ttmComplete ? 'insufficient_history' : 'missing_input';
  }

  const coordinateBase = { symbol, metricCode: 'altmanZScore', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  let ttm: BasisOutcome;
  if (!mainAnchor) {
    ttm = { action: 'skipped_no_knowledge_date' };
  } else if (ttmComplete) {
    const ttmAnchor = await resolveKnowledgeDate(
      symbol,
      ttmQuarters.map((tq, i) => ({ rocYear: Number(tq.year), season: Number(tq.season), reportDate: ttmRecords[i]?.reportDate ?? null }))
    );
    if (!ttmAnchor) {
      ttm = { action: 'skipped_no_knowledge_date' };
    } else {
      ttm = await writeMetricValue({
        ...coordinateBase,
        basis: 'TTM',
        value: zScore,
        nullReason,
        knowledgeDate: ttmAnchor.knowledgeDate,
        knowledgeDateIsFallback: ttmAnchor.isFallback,
      });
    }
  } else {
    ttm = await writeMetricValue({
      ...coordinateBase,
      basis: 'TTM',
      value: null,
      nullReason: 'insufficient_history',
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  }

  return { symbol, rocYear: year, season, ttm };
};
