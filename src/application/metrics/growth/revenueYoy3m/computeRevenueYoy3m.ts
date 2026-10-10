import { calculateRevenueYoy3m, REVENUE_YOY_3M_WINDOW_MONTHS } from '@/domain/metrics/growth/revenueYoy3m/calculateRevenueYoy3m';
import { monthlyGroup } from '@/domain/metrics/coordinate';
import { computation, type MonthlyComputationBatch } from '@/domain/metrics/computation';
import type { MonthlyRevenueEntry } from '@/application/ports/monthlyRevenue';
import { resolveContiguousMonthWindow, statutoryDeadline, toRevenue, type MonthlyMetricQuery, type SusDeps } from '../sus/computeSus';

// 近三個月累計營收年增率（見 revenueYoy3mDefinition）。資料、窗口切法、knowledge date 規則全部跟 sus 共用
// （computeSus.ts 的 resolveContiguousMonthWindow／statutoryDeadline），只是窗口 15 個月、公式不同。
export type RevenueYoy3mDeps = SusDeps;

export const resolveRevenueYoy3mWindow = (entries: MonthlyRevenueEntry[], yearMonth: string | undefined) => resolveContiguousMonthWindow(entries, yearMonth, REVENUE_YOY_3M_WINDOW_MONTHS);

export const computeRevenueYoy3m = async (query: MonthlyMetricQuery, deps: RevenueYoy3mDeps): Promise<MonthlyComputationBatch<'revenueYoy3m'>> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;
  const { entries } = await deps.monthlyRevenue.getMonthlyRevenueHistory(symbol, 600);
  const resolved = resolveRevenueYoy3mWindow(entries, query.yearMonth);
  if (!resolved) {
    return { symbol, yearMonth: query.yearMonth ?? null, slots: { revenueYoy3m: { action: 'skipped_no_quarter' } } };
  }
  const { target, window, isContiguous } = resolved;
  const [yearStr, monthStr] = target.yearMonth.split('-') as [string, string];
  const result = isContiguous ? calculateRevenueYoy3m(window.map((e) => toRevenue(e.currentMonthRevenue))) : ({ value: null, nullReason: 'insufficient_history' } as const);

  const slot = computation({
    symbol,
    metricCode: 'revenueYoy3m',
    fiscalYear: Number(yearStr),
    fiscalMonth: Number(monthStr),
    dataType,
    subsidiaryCompanyId,
    ...monthlyGroup(),
    value: result.value,
    nullReason: result.nullReason,
    knowledgeDate: target.generatedDate ? new Date(`${target.generatedDate}T00:00:00.000Z`) : statutoryDeadline(target.yearMonth),
    knowledgeDateIsFallback: target.generatedDate === null,
  });
  return { symbol, yearMonth: target.yearMonth, slots: { revenueYoy3m: slot } };
};
