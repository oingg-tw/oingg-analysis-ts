import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getQuarterlyIncomeStatement } from '@/shared/sourceData/mopsQuarterlyStatements';
import { getCashFlowStatementXbrlFirst as getQuarterlyCashFlowStatement } from '@/shared/sourceData/cashFlowStatementXbrlFirst';
import { getPaidInSharesAsOf } from '@/shared/sourceData/capitalStock';
import { getPastNQuarters, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../knowledgeDate';
import { rocYearToGregorian } from '../rocYear';
import { writeMetricValue, type MetricValueWriteOutcome } from '../metricValueWriter';
import type { MetricNullReason } from '../metricBasis';

// 這份檔案是 src/domainMetrics/ownerEarnings.ts 的獨立重新實作。股東盈餘 = 淨利+折舊+攤銷
// +資本支出（資本支出來源資料是負值/流出，用加法），結構跟 eps/revenuePerShare 一樣，只是
// 分子組成不同。

const pickNetIncome = (
  record: { netIncomeAttributableToParent: bigint | null; netIncome: bigint | null } | null
): { value: bigint | null } => {
  if (!record) return { value: null };
  if (record.netIncomeAttributableToParent !== null) return { value: record.netIncomeAttributableToParent };
  if (record.netIncome !== null) return { value: record.netIncome };
  return { value: null };
};

const toPerShare = (numeratorInThousands: bigint, shares: bigint): number | null => {
  if (shares === 0n) return null;
  return Math.round(((Number(numeratorInThousands) * 1000) / Number(shares)) * 100) / 100;
};

const determineNullReason = (numerator: bigint | null, denominator: bigint | null): MetricNullReason => {
  if (numerator === null || denominator === null) return 'missing_input';
  return 'zero_or_negative_denominator';
};

type BasisOutcome = MetricValueWriteOutcome | { action: 'skipped_no_knowledge_date' } | { action: 'skipped_no_quarter' };

export interface OwnerEarningsPitOutcome {
  symbol: string;
  rocYear: string | null;
  season: string | null;
  q: BasisOutcome;
  qAnn: BasisOutcome;
  ttm: BasisOutcome;
}

export const computeAndWriteOwnerEarningsPit = async (query: QuarterlyMetricQuery): Promise<OwnerEarningsPitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['incomeStatement', 'cashFlowStatement']);

  if (!resolvedQuarter) {
    return { symbol, rocYear: null, season: null, q: { action: 'skipped_no_quarter' }, qAnn: { action: 'skipped_no_quarter' }, ttm: { action: 'skipped_no_quarter' } };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const [incomeStatement, cashFlowStatement] = await Promise.all([getQuarterlyIncomeStatement(key), getQuarterlyCashFlowStatement(key)]);
  const netIncome = pickNetIncome(incomeStatement);
  const depreciation = cashFlowStatement?.depreciation ?? null;
  const amortization = cashFlowStatement?.amortization ?? null;
  const capitalExpenditures = cashFlowStatement?.capitalExpenditures ?? null;
  const reportDate = incomeStatement?.reportDate ?? cashFlowStatement?.reportDate ?? null;

  const shares = reportDate ? await getPaidInSharesAsOf(symbol, reportDate) : null;
  const sharesValue = shares?.paidInShares ?? null;

  const currentOwnerEarnings =
    netIncome.value !== null && depreciation !== null && amortization !== null && capitalExpenditures !== null
      ? netIncome.value + depreciation + amortization + capitalExpenditures
      : null;

  const quarterly = currentOwnerEarnings !== null && sharesValue !== null ? toPerShare(currentOwnerEarnings, sharesValue) : null;
  const quarterlyAnnualized = quarterly !== null ? Math.round(quarterly * 4 * 100) / 100 : null;
  const quarterlyNullReason: MetricNullReason | null = quarterly === null ? determineNullReason(currentOwnerEarnings, sharesValue) : null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);
  const coordinateBase = { symbol, metricCode: 'ownerEarnings', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  let q: BasisOutcome;
  let qAnn: BasisOutcome;
  if (!mainAnchor) {
    q = { action: 'skipped_no_knowledge_date' };
    qAnn = { action: 'skipped_no_knowledge_date' };
  } else {
    q = await writeMetricValue({
      ...coordinateBase,
      basis: 'Q',
      value: quarterly,
      nullReason: quarterlyNullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
    qAnn = await writeMetricValue({
      ...coordinateBase,
      basis: 'Q_ANN',
      value: quarterlyAnnualized,
      nullReason: quarterlyNullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  }

  // TTM：各分項（淨利、折舊+攤銷、資本支出）各自加總近四季（含本季），全部齊全才算。
  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) =>
      Promise.all([
        getQuarterlyIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }),
        getQuarterlyCashFlowStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }),
      ])
    )
  );

  let ownerEarningsTtmSum = 0n;
  let ttmComplete = true;
  for (const [incomeRecord, cashFlowRecord] of ttmRecords) {
    const picked = pickNetIncome(incomeRecord);
    if (picked.value === null || cashFlowRecord === null || cashFlowRecord.depreciation === null || cashFlowRecord.amortization === null || cashFlowRecord.capitalExpenditures === null) {
      ttmComplete = false;
    } else {
      ownerEarningsTtmSum += picked.value + cashFlowRecord.depreciation + cashFlowRecord.amortization + cashFlowRecord.capitalExpenditures;
    }
  }

  const ttmValue = ttmComplete && sharesValue !== null ? toPerShare(ownerEarningsTtmSum, sharesValue) : null;
  const ttmNullReason: MetricNullReason | null = ttmValue !== null ? null : ttmComplete ? determineNullReason(ownerEarningsTtmSum, sharesValue) : 'insufficient_history';

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

  return { symbol, rocYear: year, season, q, qAnn, ttm };
};
