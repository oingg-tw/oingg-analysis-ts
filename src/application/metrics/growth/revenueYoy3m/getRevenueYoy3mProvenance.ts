import { calculateRevenueYoy3m, REVENUE_YOY_3M_MONTHS, REVENUE_YOY_3M_WINDOW_MONTHS } from '@/domain/metrics/growth/revenueYoy3m/calculateRevenueYoy3m';
import type { MetricProvenanceResult, ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import { toRevenue } from '../sus/computeSus';
import { resolveRevenueYoy3mWindow, type RevenueYoy3mDeps } from './computeRevenueYoy3m';

// 2026-10-07 溯源表（「溯源表請務必都加上」）。月份定位跟 getSusProvenance 同一把尺：asOfDate 所在月份以前最新一個有營收的月份。
// 只列實際進公式的 6 個月（本期 3 個月＋去年同 3 個月），中間 9 個月只用來確認窗口連續，不列。
const SOURCE = '上市櫃公司每月營業收入（證交所／櫃買中心彙整，千元）';

export const getRevenueYoy3mProvenance = async (query: { symbol: string; asOfDate?: Date | undefined }, deps: RevenueYoy3mDeps): Promise<MetricProvenanceResult> => {
  const { symbol } = query;
  const { entries } = await deps.monthlyRevenue.getMonthlyRevenueHistory(symbol, 600);
  const asOfMonth = query.asOfDate?.toISOString().slice(0, 7);
  const candidates = asOfMonth ? entries.filter((e) => e.yearMonth <= asOfMonth) : entries;
  const resolved = candidates.length > 0 ? resolveRevenueYoy3mWindow(entries, candidates[candidates.length - 1]!.yearMonth) : null;
  if (!resolved) return { symbol, metricCode: 'revenueYoy3m', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };

  const { target, window, isContiguous } = resolved;
  const used = window.length === REVENUE_YOY_3M_WINDOW_MONTHS ? [...window.slice(0, REVENUE_YOY_3M_MONTHS), ...window.slice(-REVENUE_YOY_3M_MONTHS)] : window;
  const provenanceEntries: ProvenanceEntry[] = used.map((e, i) => ({
    role: `${e.yearMonth} 月營收（${i < REVENUE_YOY_3M_MONTHS && used.length > REVENUE_YOY_3M_MONTHS ? '去年同期' : '本期'}）`,
    fiscalYear: null,
    fiscalQuarter: null,
    type: 'other',
    statementType: null,
    fieldKey: null,
    sourceDescription: SOURCE,
    value: e.currentMonthRevenue,
  }));
  const value = isContiguous ? calculateRevenueYoy3m(window.map((e) => toRevenue(e.currentMonthRevenue))).value : null;

  return {
    symbol,
    metricCode: 'revenueYoy3m',
    found: true,
    fiscalYear: null,
    fiscalQuarter: null,
    value,
    entries: provenanceEntries,
    methodologyNote:
      `（${target.yearMonth} 往前 3 個月營收合計 − 去年同 3 個月營收合計）÷ |去年同 3 個月營收合計| × 100。去年同期取 12 個月前各月當時申報的單月營收。` +
      (isContiguous ? '' : `目標月 ${target.yearMonth} 往前不足連續 ${REVENUE_YOY_3M_WINDOW_MONTHS} 個月（或中間缺月），不算。`),
  };
};
