import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getQuarterlyBalanceSheet, getQuarterlyIncomeStatement, getQuarterlyCashFlowStatement } from '@/shared/sourceData/mopsQuarterlyStatements';
import { getPastNQuarters, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../knowledgeDate';
import { rocYearToGregorian } from '../rocYear';
import { writeMetricValue, type MetricValueWriteOutcome } from '../metricValueWriter';
import type { MetricNullReason } from '../metricBasis';

// 這份檔案是 src/domainMetrics/accrualsRatio.ts 的獨立重新實作。分母固定用本季期末總資產
// （不平均、不加總 TTM），跟 ROE/ROA 用期末值同一種簡化。

const pickNetIncome = (
  record: { netIncomeAttributableToParent: bigint | null; netIncome: bigint | null } | null
): { value: bigint | null } => {
  if (!record) return { value: null };
  if (record.netIncomeAttributableToParent !== null) return { value: record.netIncomeAttributableToParent };
  if (record.netIncome !== null) return { value: record.netIncome };
  return { value: null };
};

const toPct = (numerator: bigint, denominator: bigint): number | null => {
  if (denominator === 0n) return null;
  return Math.round((Number(numerator) / Number(denominator)) * 100 * 100) / 100;
};

const determineNullReason = (numerator: bigint | null, denominator: bigint | null): MetricNullReason => {
  if (numerator === null || denominator === null) return 'missing_input';
  return 'zero_or_negative_denominator';
};

type BasisOutcome = MetricValueWriteOutcome | { action: 'skipped_no_knowledge_date' } | { action: 'skipped_no_quarter' };

export interface AccrualsRatioPitOutcome {
  symbol: string;
  rocYear: string | null;
  season: string | null;
  q: BasisOutcome;
  qAnn: BasisOutcome;
  ttm: BasisOutcome;
}

export const computeAndWriteAccrualsRatioPit = async (query: QuarterlyMetricQuery): Promise<AccrualsRatioPitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['balanceSheet', 'incomeStatement', 'cashFlowStatement']);

  if (!resolvedQuarter) {
    return {
      symbol,
      rocYear: null,
      season: null,
      q: { action: 'skipped_no_quarter' },
      qAnn: { action: 'skipped_no_quarter' },
      ttm: { action: 'skipped_no_quarter' },
    };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const [balanceSheet, incomeStatement, cashFlowStatement] = await Promise.all([
    getQuarterlyBalanceSheet(key),
    getQuarterlyIncomeStatement(key),
    getQuarterlyCashFlowStatement(key),
  ]);

  const totalAssets = balanceSheet?.totalAssets ?? null;
  const netIncome = pickNetIncome(incomeStatement);
  const operatingCashFlow = cashFlowStatement?.netCashFromOperatingActivities ?? null;
  const investingCashFlow = cashFlowStatement?.netCashFromInvestingActivities ?? null;
  const reportDate = balanceSheet?.reportDate ?? incomeStatement?.reportDate ?? cashFlowStatement?.reportDate ?? null;

  const accrualsQuarterly =
    netIncome.value !== null && operatingCashFlow !== null && investingCashFlow !== null ? netIncome.value - operatingCashFlow - investingCashFlow : null;
  const accrualsRatioQuarterly = accrualsQuarterly !== null && totalAssets !== null ? toPct(accrualsQuarterly, totalAssets) : null;
  const accrualsRatioQuarterlyAnnualized = accrualsRatioQuarterly !== null ? Math.round(accrualsRatioQuarterly * 4 * 100) / 100 : null;
  const quarterlyNullReason: MetricNullReason | null = accrualsRatioQuarterly === null ? determineNullReason(accrualsQuarterly, totalAssets) : null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);
  const coordinateBase = { symbol, metricCode: 'accrualsRatio', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  let q: BasisOutcome;
  let qAnn: BasisOutcome;
  if (!mainAnchor) {
    q = { action: 'skipped_no_knowledge_date' };
    qAnn = { action: 'skipped_no_knowledge_date' };
  } else {
    q = await writeMetricValue({
      ...coordinateBase,
      basis: 'Q',
      value: accrualsRatioQuarterly,
      nullReason: quarterlyNullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
    qAnn = await writeMetricValue({
      ...coordinateBase,
      basis: 'Q_ANN',
      value: accrualsRatioQuarterlyAnnualized,
      nullReason: quarterlyNullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  }

  // TTM：近四季（含本季）淨利/OCF/ICF 各自加總，分母固定用本季期末總資產。
  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) =>
      Promise.all([
        getQuarterlyIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }),
        getQuarterlyCashFlowStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }),
      ])
    )
  );

  let netIncomeTtmSum = 0n;
  let ocfTtmSum = 0n;
  let icfTtmSum = 0n;
  let ttmComplete = true;
  for (const [incomeRecord, cashFlowRecord] of ttmRecords) {
    const picked = pickNetIncome(incomeRecord);
    if (picked.value === null || cashFlowRecord === null || cashFlowRecord.netCashFromOperatingActivities === null || cashFlowRecord.netCashFromInvestingActivities === null) {
      ttmComplete = false;
    } else {
      netIncomeTtmSum += picked.value;
      ocfTtmSum += cashFlowRecord.netCashFromOperatingActivities;
      icfTtmSum += cashFlowRecord.netCashFromInvestingActivities;
    }
  }

  const accrualsTtm = ttmComplete ? netIncomeTtmSum - ocfTtmSum - icfTtmSum : null;
  const ttmValue = accrualsTtm !== null && totalAssets !== null ? toPct(accrualsTtm, totalAssets) : null;
  const ttmNullReason: MetricNullReason | null = ttmValue !== null ? null : ttmComplete ? determineNullReason(accrualsTtm, totalAssets) : 'insufficient_history';

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
