import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getIncomeStatementXbrlFirst as getQuarterlyIncomeStatement } from '@/shared/sourceData/incomeStatementXbrlFirst';
import { getMarketCapAsOf } from '@/shared/sourceData/marketCap';
import { getPastNQuarters, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../knowledgeDate';
import { rocYearToGregorian } from '../rocYear';
import { writeMetricValue, type MetricValueWriteOutcome } from '../metricValueWriter';
import type { MetricNullReason } from '../metricBasis';

// 這份檔案是 src/domainMetrics/psr.ts 的獨立重新實作——舊架構呼叫 calculateRevenuePerShare()，
// 這裡不依賴 revenuePerShare 這個 metric_code 已寫入的值，自己重新查損益表算營收。市值部分
// 直接複用 resolveKnowledgeDate 算出來的 knowledge_date 去查 getMarketCapAsOf——跟
// fcfYield/computeFcfYieldPit.ts 發現的「股價/市值不需要另外設計 knowledge_date 機制」一致，
// Q_ANN/TTM 共用同一次市值查詢結果，不分別重查。沒有單季非年化版本（store/flow 比率）。

const toMultipleFromThousands = (marketCap: number, amountInThousands: bigint): number | null => {
  const denominator = Number(amountInThousands) * 1000;
  if (denominator === 0) return null;
  return Math.round((marketCap / denominator) * 100) / 100;
};

type BasisOutcome = MetricValueWriteOutcome | { action: 'skipped_no_knowledge_date' } | { action: 'skipped_no_quarter' };

export interface PsrPitOutcome {
  symbol: string;
  rocYear: string | null;
  season: string | null;
  qAnn: BasisOutcome;
  ttm: BasisOutcome;
}

export const computeAndWritePsrPit = async (query: QuarterlyMetricQuery): Promise<PsrPitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['incomeStatement']);

  if (!resolvedQuarter) {
    return { symbol, rocYear: null, season: null, qAnn: { action: 'skipped_no_quarter' }, ttm: { action: 'skipped_no_quarter' } };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const incomeStatement = await getQuarterlyIncomeStatement(key);
  const operatingRevenue = incomeStatement?.operatingRevenue ?? null;
  const reportDate = incomeStatement?.reportDate ?? null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);
  const marketCap = mainAnchor ? await getMarketCapAsOf(symbol, mainAnchor.knowledgeDate) : null;

  const psrQuarterlyAnnualized = operatingRevenue !== null && marketCap !== null ? toMultipleFromThousands(marketCap.marketCap, operatingRevenue * 4n) : null;
  const qAnnNullReason: MetricNullReason | null = psrQuarterlyAnnualized === null ? (marketCap === null || operatingRevenue === null ? 'missing_input' : 'zero_or_negative_denominator') : null;

  const coordinateBase = { symbol, metricCode: 'psr', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  let qAnn: BasisOutcome;
  if (!mainAnchor) {
    qAnn = { action: 'skipped_no_knowledge_date' };
  } else {
    qAnn = await writeMetricValue({
      ...coordinateBase,
      basis: 'Q_ANN',
      value: psrQuarterlyAnnualized,
      nullReason: qAnnNullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  }

  // TTM：近四季（含本季）營收加總；市值沿用上面同一筆（本季 knowledge_date 查到的），不是
  // 另外用 TTM anchor 重查一次，跟 fcfYield 的既有行為一致。
  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => getQuarterlyIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );

  let revenueTtmSum = 0n;
  let ttmComplete = true;
  for (const record of ttmRecords) {
    if (record === null || record.operatingRevenue === null) {
      ttmComplete = false;
    } else {
      revenueTtmSum += record.operatingRevenue;
    }
  }

  const psrTtm = ttmComplete && marketCap !== null ? toMultipleFromThousands(marketCap.marketCap, revenueTtmSum) : null;
  const ttmNullReason: MetricNullReason | null = psrTtm !== null ? null : ttmComplete ? (marketCap === null ? 'missing_input' : 'zero_or_negative_denominator') : 'insufficient_history';

  let ttm: BasisOutcome;
  if (ttmComplete) {
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
        value: psrTtm,
        nullReason: ttmNullReason,
        knowledgeDate: ttmAnchor.knowledgeDate,
        knowledgeDateIsFallback: ttmAnchor.isFallback,
      });
    }
  } else if (mainAnchor) {
    ttm = await writeMetricValue({
      ...coordinateBase,
      basis: 'TTM',
      value: null,
      nullReason: 'insufficient_history',
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  } else {
    ttm = { action: 'skipped_no_knowledge_date' };
  }

  return { symbol, rocYear: year, season, qAnn, ttm };
};
