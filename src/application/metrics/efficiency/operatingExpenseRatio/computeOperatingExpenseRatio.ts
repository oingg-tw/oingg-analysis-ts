import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { toPercent } from '@/domain/metrics/shared/numericHelpers';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { computation, type ComputationBatch, type ComputationSlot, noQuarterBatch, periodSlot } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';

export type OperatingExpenseRatioDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements'>;

export type OperatingExpenseRatioComputationBatch = ComputationBatch<'q' | 'ttm'>;

// 營業費用率 = 營業費用(推銷費用+管理費用) / 營收 * 100——只用 sellingExpenses+adminExpenses，
// 不含研發費用（income statement 目前沒有獨立的研發費用欄位，跟 Beneish M-Score 的 SGAI
// 概念一致，是 SG&A 水準版，不是含 R&D 的營業費用全口徑）。跟既有 grossMargin/
// operatingMargin 家族同一種 Q/TTM 設計，但這支不是家族檔案的一部分，獨立查詢——刻意不做
// 保險業替代科目 fallback（保險業損益表結構本來就沒有這個概念，跟既有 margins 家族的既有
// 決策一致，不要看到那裡有 fallback 就依樣畫葫蘆）。
export const computeOperatingExpenseRatio = async (query: QuarterlyMetricQuery, deps: OperatingExpenseRatioDeps): Promise<OperatingExpenseRatioComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return noQuarterBatch(symbol, ['q', 'ttm']);
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const incomeStatement = await deps.statements.getIncomeStatement(key);
  const reportDate = incomeStatement?.reportDate ?? null;
  const operatingExpense =
    incomeStatement?.sellingExpenses !== null && incomeStatement?.adminExpenses !== null && incomeStatement !== null
      ? incomeStatement.sellingExpenses! + incomeStatement.adminExpenses!
      : null;
  const revenue = incomeStatement?.operatingRevenue ?? null;

  const ratioQuarterly = operatingExpense !== null && revenue !== null ? toPercent(operatingExpense, revenue) : null;
  const quarterlyNullReason: MetricNullReason | null =
    ratioQuarterly !== null ? null : operatingExpense === null || revenue === null ? 'missing_input' : 'zero_or_negative_denominator';

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);
  const coordinateBase = { symbol, metricCode: 'operatingExpenseRatio', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  const q = periodSlot(mainAnchor, coordinateBase, 'Q', ratioQuarterly, quarterlyNullReason);

  // TTM：近四季（含本季）營業費用/營收各自加總。
  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => deps.statements.getIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );

  let expenseTtmSum = 0n;
  let revenueTtmSum = 0n;
  let ttmComplete = true;
  for (const record of ttmRecords) {
    if (record === null || record.sellingExpenses === null || record.adminExpenses === null || record.operatingRevenue === null) {
      ttmComplete = false;
    } else {
      expenseTtmSum += record.sellingExpenses + record.adminExpenses;
      revenueTtmSum += record.operatingRevenue;
    }
  }

  const ratioTtm = ttmComplete ? toPercent(expenseTtmSum, revenueTtmSum) : null;
  const ttmNullReason: MetricNullReason | null = ratioTtm !== null ? null : !ttmComplete ? 'insufficient_history' : 'zero_or_negative_denominator';

  let ttm: ComputationSlot;
  if (ttmComplete) {
    const ttmAnchor = await resolveKnowledgeDate(
      symbol,
      ttmQuarters.map((tq, i) => ({ rocYear: Number(tq.year), season: Number(tq.season), reportDate: ttmRecords[i]?.reportDate ?? null })), deps.announcements
    );
    if (!ttmAnchor) {
      ttm = { action: 'skipped_no_knowledge_date' };
    } else {
      ttm = computation({
        ...coordinateBase,
        ...periodTypeGroup('TTM'),
        value: ratioTtm,
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
