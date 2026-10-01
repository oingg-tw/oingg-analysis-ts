import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { determineNullReason, toPercent } from '@/domain/metrics/shared/numericHelpers';
import { rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { computation, type ComputationBatch, type ComputationSlot, noQuarterBatch } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';
import { resolveTrailingCashFlowStatements, resolveTrailingIncomeStatements } from '@/application/metrics/shared/trailingYear';

// 量化選股盤點使用者要求新增。自由現金流 = 營業活動現金流 + 投資性資本支出
// （capitalExpenditures 現金流量表原始科目已是負數），跟 ocfPerShare/fcfPerShare 同一套
// FCF 定義，獨立重新計算不依賴其已寫入的值。只有 TTM 一種 basis。


export type FcfMarginDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'cumulativeStatements'>;

export type FcfMarginComputationBatch = ComputationBatch<'ttm'>;

export const computeFcfMargin = async (query: QuarterlyMetricQuery, deps: FcfMarginDeps): Promise<FcfMarginComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement', 'cashFlowStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return noQuarterBatch(symbol, ['ttm']);
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  // 2026-10-01 近一年改走共用來源（興櫃半年頻，見 shared/trailingYear.ts）；損益表與現金流量表的 periods 順序相同。
  const trailingKey = { symbol, rocYear, season: season as Season, dataType, subsidiaryCompanyId };
  const [trailingIncome, trailingCashFlow] = await Promise.all([resolveTrailingIncomeStatements(trailingKey, deps), resolveTrailingCashFlowStatements(trailingKey, deps)]);
  const ttmQuarters = trailingIncome.periods;
  const ttmRecords = trailingIncome.periods.map((p, i) => [p.record, trailingCashFlow.periods[i]?.record ?? null] as const);

  let revenueTtmSum = 0n;
  let fcfTtmSum = 0n;
  let ttmComplete = true;
  for (const [incomeRecord, cashFlowRecord] of ttmRecords) {
    if (
      incomeRecord === null ||
      cashFlowRecord === null ||
      incomeRecord.operatingRevenue === null ||
      cashFlowRecord.netCashFromOperatingActivities === null ||
      cashFlowRecord.capitalExpenditures === null
    ) {
      ttmComplete = false;
    } else {
      revenueTtmSum += incomeRecord.operatingRevenue;
      fcfTtmSum += cashFlowRecord.netCashFromOperatingActivities + cashFlowRecord.capitalExpenditures;
    }
  }

  const ttmValue = ttmComplete ? toPercent(fcfTtmSum, revenueTtmSum) : null;
  const ttmNullReason: MetricNullReason | null = ttmValue !== null ? null : ttmComplete ? determineNullReason(fcfTtmSum, revenueTtmSum) : 'insufficient_history';

  const coordinateBase = { symbol, metricCode: 'fcfMargin', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

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
  } else {
    const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
    const currentIncome = await deps.statements.getIncomeStatement(key);
    const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate: currentIncome?.reportDate ?? null }], deps.announcements);
    if (!mainAnchor) {
      ttm = { action: 'skipped_no_knowledge_date' };
    } else {
      ttm = computation({
        ...coordinateBase,
        ...periodTypeGroup('TTM'),
        value: null,
        nullReason: 'insufficient_history',
        knowledgeDate: mainAnchor.knowledgeDate,
        knowledgeDateIsFallback: mainAnchor.isFallback,
      });
    }
  }

  return { symbol, rocYear: year, season, slots: { ttm } };
};
