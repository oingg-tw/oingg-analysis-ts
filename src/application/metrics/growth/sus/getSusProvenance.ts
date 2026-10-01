import { SUS_DIFF_COUNT, SUS_SEASONAL_LAG, SUS_WINDOW_MONTHS, calculateSus } from '@/domain/metrics/growth/sus/calculateSus';
import type { MetricProvenanceResult, ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import { resolveSusWindow, toRevenue, type SusDeps } from './computeSus';

// 2026-10-01 補溯源表（使用者：「溯源表請務必都加上」）。sus 是月頻（metric_monthly_values，座標＝營收所屬年月），
// 用 asOfDate 定位：取營收所屬月份 ≤ asOfDate 那個月的最新一個有營收的月份（不給就是最新）；year/season 不適用。
// 這裡比的是「營收所屬月份」不是公告日——跟寫入的座標（fiscalYear/fiscalMonth）同一把尺，查 2026-08-15 會拿到 8 月營收那一列，
// 即使 8 月營收 9/10 才公告。
//
// 窗口切法、計算都呼叫 computeSus 同一支 resolveSusWindow／calculateSus，21 個月逐月列出（t−20…t），中繼值（預期營收、
// 漂移項、標準差）寫在 methodologyNote。
const SOURCE = '上市櫃公司每月營業收入（證交所／櫃買中心彙整，千元）';

const lagLabel = (lag: number): string => {
  if (lag === 0) return '目標月 t';
  if (lag === SUS_SEASONAL_LAG) return `t−${lag}，目標月的季節基期`;
  if (lag <= SUS_DIFF_COUNT) return `t−${lag}，第 ${lag} 個季節差分的當月`;
  if (lag - SUS_SEASONAL_LAG >= 1 && lag - SUS_SEASONAL_LAG <= SUS_DIFF_COUNT) return `t−${lag}，第 ${lag - SUS_SEASONAL_LAG} 個季節差分的去年同月`;
  return `t−${lag}`;
};

export const getSusProvenance = async (query: { symbol: string; asOfDate?: Date | undefined }, deps: SusDeps): Promise<MetricProvenanceResult> => {
  const { symbol } = query;
  const { entries } = await deps.monthlyRevenue.getMonthlyRevenueHistory(symbol, 600);
  const asOfMonth = query.asOfDate?.toISOString().slice(0, 7);
  const candidates = asOfMonth ? entries.filter((e) => e.yearMonth <= asOfMonth) : entries;
  const resolved = candidates.length > 0 ? resolveSusWindow(entries, candidates[candidates.length - 1]!.yearMonth) : null;
  if (!resolved) return { symbol, metricCode: 'sus', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };

  const { target, window, isContiguous } = resolved;
  const result = isContiguous ? calculateSus(window.map((e) => toRevenue(e.currentMonthRevenue))) : null;

  const provenanceEntries: ProvenanceEntry[] = window.map((e, i) => ({
    role: `${e.yearMonth} 月營收（${lagLabel(window.length - 1 - i)}）`,
    fiscalYear: null,
    fiscalQuarter: null,
    type: 'other',
    statementType: null,
    fieldKey: null,
    sourceDescription: SOURCE,
    value: e.currentMonthRevenue,
  }));

  const c = result?.components;
  const detail = c
    ? `本期：預期營收＝${c.expected}、漂移項＝${c.drift}、標準差＝${c.sigma}（千元）。`
    : isContiguous
      ? ''
      : `目標月 ${target.yearMonth} 往前不足連續 ${SUS_WINDOW_MONTHS} 個月（或中間缺月），不算。`;

  return {
    symbol,
    metricCode: 'sus',
    found: true,
    fiscalYear: null,
    fiscalQuarter: null,
    value: result?.value ?? null,
    entries: provenanceEntries,
    methodologyNote:
      `SUS（標準化未預期營收）＝（目標月營收 − 預期營收）÷ 標準差，照 Jegadeesh & Livnat（2006）SURGE 的做法，季營收改成台灣的月營收、` +
      `每股營收改成營收金額。季節差分＝當月 − 去年同月；漂移項＝前 ${SUS_DIFF_COUNT} 個月（t−1…t−${SUS_DIFF_COUNT}）季節差分的平均，標準差＝同 ${SUS_DIFF_COUNT} 個差分的樣本標準差（除以 ${SUS_DIFF_COUNT - 1}）；` +
      `預期營收＝去年同月（t−${SUS_SEASONAL_LAG}）＋漂移項。需要 t−${SUS_WINDOW_MONTHS - 1} 到 t 共 ${SUS_WINDOW_MONTHS} 個月連續無缺，上方逐月列出。${detail}`,
  };
};
