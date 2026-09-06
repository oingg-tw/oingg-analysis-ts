import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getQuarterlyIncomeStatement } from '@/shared/sourceData/mopsQuarterlyStatements';
import { getCashFlowStatementXbrlFirst as getQuarterlyCashFlowStatement } from '@/shared/sourceData/cashFlowStatementXbrlFirst';
import { getPastNQuarters, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../knowledgeDate';
import { rocYearToGregorian } from '../rocYear';
import { writeMetricValue, type MetricValueWriteOutcome } from '../metricValueWriter';
import type { MetricNullReason } from '../metricBasis';

// 這份檔案是 src/domainMetrics/capexToRevenue.ts 的獨立重新實作。資本支出來源資料是負值
// （現金流出），取絕對值後再算比率。沒有 Q_ANN——flow/flow 比率年化沒有意義。

const toPct = (numerator: bigint, denominator: bigint): number | null => {
  if (denominator === 0n) return null;
  return Math.round((Number(numerator) / Number(denominator)) * 100 * 100) / 100;
};

const abs = (value: bigint): bigint => (value < 0n ? -value : value);

const determineNullReason = (numerator: bigint | null, denominator: bigint | null): MetricNullReason => {
  if (numerator === null || denominator === null) return 'missing_input';
  return 'zero_or_negative_denominator';
};

type BasisOutcome = MetricValueWriteOutcome | { action: 'skipped_no_knowledge_date' } | { action: 'skipped_no_quarter' };

export interface CapexToRevenuePitOutcome {
  symbol: string;
  rocYear: string | null;
  season: string | null;
  q: BasisOutcome;
  ttm: BasisOutcome;
}

export const computeAndWriteCapexToRevenuePit = async (query: QuarterlyMetricQuery): Promise<CapexToRevenuePitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['incomeStatement', 'cashFlowStatement']);

  if (!resolvedQuarter) {
    return { symbol, rocYear: null, season: null, q: { action: 'skipped_no_quarter' }, ttm: { action: 'skipped_no_quarter' } };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const [incomeStatement, cashFlowStatement] = await Promise.all([getQuarterlyIncomeStatement(key), getQuarterlyCashFlowStatement(key)]);
  const operatingRevenue = incomeStatement?.operatingRevenue ?? null;
  const capitalExpenditures = cashFlowStatement?.capitalExpenditures ?? null;
  const reportDate = incomeStatement?.reportDate ?? cashFlowStatement?.reportDate ?? null;

  const quarterly = capitalExpenditures !== null && operatingRevenue !== null ? toPct(abs(capitalExpenditures), operatingRevenue) : null;
  const quarterlyNullReason: MetricNullReason | null = quarterly === null ? determineNullReason(capitalExpenditures, operatingRevenue) : null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);
  const coordinateBase = { symbol, metricCode: 'capexToRevenue', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  let q: BasisOutcome;
  if (!mainAnchor) {
    q = { action: 'skipped_no_knowledge_date' };
  } else {
    q = await writeMetricValue({
      ...coordinateBase,
      basis: 'Q',
      value: quarterly,
      nullReason: quarterlyNullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  }

  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) =>
      Promise.all([
        getQuarterlyIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }),
        getQuarterlyCashFlowStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }),
      ])
    )
  );

  let revenueTtmSum = 0n;
  let capexTtmSum = 0n;
  let ttmComplete = true;
  for (const [incomeRecord, cashFlowRecord] of ttmRecords) {
    if (incomeRecord === null || cashFlowRecord === null || incomeRecord.operatingRevenue === null || cashFlowRecord.capitalExpenditures === null) {
      ttmComplete = false;
    } else {
      revenueTtmSum += incomeRecord.operatingRevenue;
      capexTtmSum += cashFlowRecord.capitalExpenditures;
    }
  }

  const ttmValue = ttmComplete ? toPct(abs(capexTtmSum), revenueTtmSum) : null;
  const ttmNullReason: MetricNullReason | null = ttmValue !== null ? null : ttmComplete ? determineNullReason(capexTtmSum, revenueTtmSum) : 'insufficient_history';

  let ttm: BasisOutcome;
  if (ttmComplete) {
    const ttmAnchor = await resolveKnowledgeDate(
      symbol,
      ttmQuarters.map((tq, i) => ({ rocYear: Number(tq.year), season: Number(tq.season), reportDate: ttmRecords[i]![0]?.reportDate ?? null }))
    );
    if (!ttmAnchor) {
      ttm = { action: 'skipped_no_knowledge_date' };
    } else {
      ttm = await writeMetricValue({
        ...coordinateBase,
        basis: 'TTM',
        value: ttmValue,
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

  return { symbol, rocYear: year, season, q, ttm };
};
