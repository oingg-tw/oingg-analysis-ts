import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import type { MetricComputation } from '@/domain/metrics/computation';
import { resolveThreeMarginsRisingInputs, type ThreeMarginsRisingDeps } from './computeThreeMarginsRising';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-21 web-nuxt 要求：threeMarginsRising 的稽核鏈。這支的輸入不是原始財報欄位，是三支本站指標
// （grossMargin/operatingMargin/netProfitMargin，各自都有稽核鏈）在三個座標（本季/上一季/去年同季）的 Q 值，
// 所以 entries 用 type 'other' + sourceDescription 指回那支指標，9 筆，讓前端可以再連到各率自己的稽核鏈。
const MARGINS = [
  ['gross', 'grossMargin', '毛利率'],
  ['operating', 'operatingMargin', '營業利益率'],
  ['net', 'netProfitMargin', '稅後淨利率'],
] as const;

const entry = (label: string, code: string, coordLabel: string, m: MetricComputation | undefined): ProvenanceEntry => ({
  role: `${coordLabel} ${label}`,
  fiscalYear: m?.fiscalYear ?? null,
  fiscalQuarter: m?.fiscalQuarter ?? null,
  type: 'other',
  statementType: null,
  fieldKey: null,
  sourceDescription: `本站指標 ${code}.Q（有自己的稽核鏈）`,
  value: toProvenanceEntryValue(m?.value ?? null),
});

export const getThreeMarginsRisingProvenance = async (query: QuarterlyMetricQuery, deps: ThreeMarginsRisingDeps): Promise<MetricProvenanceResult> => {
  const resolved = await resolveThreeMarginsRisingInputs(query, deps);
  if (!resolved || !resolved.resolution) {
    return { symbol: query.symbol, metricCode: 'threeMarginsRising', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }
  const { year, season, resolution } = resolved;
  const { current, qoqBase, yoyBase, signals, score } = resolution;

  const entries: ProvenanceEntry[] = MARGINS.flatMap(([key, code, label]) => [
    entry(label, code, '本季', current[key]),
    entry(label, code, '上一季', qoqBase?.[key]),
    entry(label, code, '去年同季', yoyBase?.[key]),
  ]);

  const signalText = MARGINS.map(([, code, label]) => `${label}（${code}）：${signals[code] === null ? '無法判定' : signals[code] ? '升' : '未升'}`).join('；');
  return {
    symbol: query.symbol,
    metricCode: 'threeMarginsRising',
    found: true,
    fiscalYear: rocYearToGregorian(Number(year)),
    fiscalQuarter: Number(season),
    value: score,
    entries,
    methodologyNote: `每一率「本季 > 上一季」且「本季 > 去年同季」才算一升，分數 = 升的個數。${signalText}。`,
  };
};
