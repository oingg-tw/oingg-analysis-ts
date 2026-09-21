import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveEarningsToRecordHighInputs, type EarningsToRecordHighDeps, type EarningsToRecordHighQuarter } from './computeEarningsToRecordHigh';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-21 web-nuxt 要求：earningsToRecordHigh 的稽核鏈——讀者想知道「創的是哪一季的新高」，所以
// entries 除了本季淨利，第二筆就是前 12 季裡最高的那一季（帶座標）。其餘 11 季不逐筆列（跟 sue 的
// 取捨一樣，用 methodologyNote 講清楚窗口）；12 季不齊時第二筆 value 為 null、座標為 null。
const entry = (role: string, q: EarningsToRecordHighQuarter | null): ProvenanceEntry => ({
  role,
  fiscalYear: q?.fiscalYear ?? null,
  fiscalQuarter: q?.season ?? null,
  type: 'statementField',
  statementType: 'incomeStatement',
  fieldKey: q?.netIncome.fieldKey ?? null,
  sourceDescription: null,
  value: toProvenanceEntryValue(q?.netIncome.value ?? null),
});

export const getEarningsToRecordHighProvenance = async (query: QuarterlyMetricQuery, deps: EarningsToRecordHighDeps): Promise<MetricProvenanceResult> => {
  const resolution = await resolveEarningsToRecordHighInputs(query, deps);
  if (!resolution) {
    return { symbol: query.symbol, metricCode: 'earningsToRecordHigh', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { fiscalYear, fiscalQuarter, current, recordHighQuarter, value } = resolution;
  return {
    symbol: query.symbol,
    metricCode: 'earningsToRecordHigh',
    found: true,
    fiscalYear,
    fiscalQuarter,
    value,
    entries: [entry('本季單季淨利（歸屬母公司）', current), entry('近三年最高單季淨利（前 12 季，不含本季，取最高那一季）', recordHighQuarter)],
    methodologyNote: '本季淨利 / 前 12 季（不含本季）最高單季淨利 × 100。12 季任一缺漏不計算（分母那筆座標為 null）；只列出最高那一季，其餘 11 季不逐筆列出。',
  };
};
