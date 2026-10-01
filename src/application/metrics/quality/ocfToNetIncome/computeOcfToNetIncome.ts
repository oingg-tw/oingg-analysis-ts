import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { determineNullReason } from '@/domain/metrics/shared/numericHelpers';
import { pickNetIncome } from '@/domain/metrics/shared/pickers';
import { rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { computation, type ComputationBatch, type ComputationSlot, noQuarterBatch, periodSlot } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';
import { resolveTrailingCashFlowStatements, resolveTrailingIncomeStatements } from '@/application/metrics/shared/trailingYear';

// 這份檔案是 src/domainMetrics/ocfToNetIncome.ts 的獨立重新實作。沒有 Q_ANN——flow/flow
// 比率年化沒有意義，跟 netProfitMargin 同一種規則。

// 單位是「倍」，不是百分比。
const toRatio = (numerator: bigint, denominator: bigint): number | null => {
  if (denominator === 0n) return null;
  return Math.round((Number(numerator) / Number(denominator)) * 100) / 100;
};


export type OcfToNetIncomeDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'cumulativeStatements'>;

export type OcfToNetIncomeComputationBatch = ComputationBatch<'q' | 'ttm'>;

export const computeOcfToNetIncome = async (
  query: QuarterlyMetricQuery,
  deps: OcfToNetIncomeDeps
): Promise<OcfToNetIncomeComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement', 'cashFlowStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return noQuarterBatch(symbol, ['q', 'ttm']);
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const [incomeStatement, cashFlowStatement] = await Promise.all([deps.statements.getIncomeStatement(key), deps.statements.getCashFlowStatement(key)]);
  const netIncome = pickNetIncome(incomeStatement);
  const operatingCashFlow = cashFlowStatement?.netCashFromOperatingActivities ?? null;
  const reportDate = incomeStatement?.reportDate ?? cashFlowStatement?.reportDate ?? null;

  const quarterly = operatingCashFlow !== null && netIncome.value !== null ? toRatio(operatingCashFlow, netIncome.value) : null;
  const quarterlyNullReason: MetricNullReason | null = quarterly === null ? determineNullReason(operatingCashFlow, netIncome.value) : null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);
  const coordinateBase = { symbol, metricCode: 'ocfToNetIncome', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  const q = periodSlot(mainAnchor, coordinateBase, 'Q', quarterly, quarterlyNullReason);

  // 2026-10-01 近一年改走共用來源（興櫃半年頻，見 shared/trailingYear.ts）；損益表與現金流量表的 periods 順序相同。
  const trailingKey = { symbol, rocYear, season: season as Season, dataType, subsidiaryCompanyId };
  const [trailingIncome, trailingCashFlow] = await Promise.all([resolveTrailingIncomeStatements(trailingKey, deps), resolveTrailingCashFlowStatements(trailingKey, deps)]);
  const ttmQuarters = trailingIncome.periods;
  const ttmRecords = trailingIncome.periods.map((p, i) => [p.record, trailingCashFlow.periods[i]?.record ?? null] as const);

  let netIncomeTtmSum = 0n;
  let ocfTtmSum = 0n;
  let ttmComplete = true;
  for (const [incomeRecord, cashFlowRecord] of ttmRecords) {
    const picked = pickNetIncome(incomeRecord);
    if (picked.value === null || cashFlowRecord === null || cashFlowRecord.netCashFromOperatingActivities === null) {
      ttmComplete = false;
    } else {
      netIncomeTtmSum += picked.value;
      ocfTtmSum += cashFlowRecord.netCashFromOperatingActivities;
    }
  }

  const ttmValue = ttmComplete ? toRatio(ocfTtmSum, netIncomeTtmSum) : null;
  const ttmNullReason: MetricNullReason | null = ttmValue !== null ? null : ttmComplete ? determineNullReason(ocfTtmSum, netIncomeTtmSum) : 'insufficient_history';

  let ttm: ComputationSlot;
  if (ttmComplete) {
    const ttmAnchor = await resolveKnowledgeDate(
      symbol,
      ttmQuarters.map((tq, i) => ({ rocYear: Number(tq.year), season: Number(tq.season), reportDate: ttmRecords[i]![0]?.reportDate ?? null })), deps.announcements
    );
    if (!ttmAnchor) {
      ttm = { action: 'skipped_no_knowledge_date' };
    } else {
      ttm = computation({
        ...coordinateBase,
        ...periodTypeGroup('TTM'),
        value: ttmValue,
        nullReason: ttmNullReason,
        knowledgeDate: ttmAnchor.knowledgeDate,
        knowledgeDateIsFallback: ttmAnchor.isFallback,
      });
    }
  } else if (mainAnchor) {
    ttm = computation({
      ...coordinateBase,
      ...periodTypeGroup('TTM'),
      value: null,
      nullReason: 'insufficient_history',
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  } else {
    ttm = { action: 'skipped_no_knowledge_date' };
  }

  return { symbol, rocYear: year, season, slots: { q, ttm } };
};
