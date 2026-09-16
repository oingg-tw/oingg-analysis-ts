import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveSueInputs, type SueQuarterDetail } from './computeSuePit';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-10 web-nuxt 要求：GET /companies/:symbol/metric-provenance 的 sue 試點，
// 現查現算不持久化。完整計算需要 24 季資料（估 20 期 UE 的樣本標準差），若每季都列成
// entry 會變成單次回應 48 筆，不是使用者真正想驗證的東西——標準差是統計估計值，不是
// 可逐格核對的原始事實。拍板：entries 只列「構成本季 UE」的 4 筆（本季/去年同季各自的
// 淨利+股數），20 期樣本本身不逐筆列出，改用 methodologyNote 講清楚這個取捨。


const buildQuarterEntries = (detail: SueQuarterDetail, label: string): ProvenanceEntry[] => {
  const netIncomeEntry: ProvenanceEntry = {
    role: `${label}單季淨利（歸屬母公司）`,
    fiscalYear: detail.fiscalYear,
    fiscalQuarter: detail.season,
    type: 'statementField',
    statementType: 'incomeStatement',
    fieldKey: detail.netIncome.fieldKey,
    sourceDescription: null,
    value: toProvenanceEntryValue(detail.netIncome.value),
  };

  const sharesEntry: ProvenanceEntry = {
    role: `${label}流通股數（計算 EPS 用）`,
    fiscalYear: detail.fiscalYear,
    fiscalQuarter: detail.season,
    type: 'other',
    statementType: null,
    fieldKey: null,
    sourceDescription: '公開發行公司股本變動申報',
    value: toProvenanceEntryValue(detail.shares),
  };

  return [netIncomeEntry, sharesEntry];
};

export const getSueProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const resolution = await resolveSueInputs(query);

  if (!resolution) {
    return { symbol: query.symbol, metricCode: 'sue', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { symbol, fiscalYear, fiscalQuarter, quarterDetails, lastIndex, sueValue } = resolution;
  const currentQuarter = quarterDetails[lastIndex]!;
  const priorYearQuarter = quarterDetails[lastIndex - 4]!;

  const entries: ProvenanceEntry[] = [...buildQuarterEntries(currentQuarter, '本季'), ...buildQuarterEntries(priorYearQuarter, '去年同季')];

  return {
    symbol,
    metricCode: 'sue',
    found: true,
    fiscalYear,
    fiscalQuarter,
    value: sueValue,
    entries,
    methodologyNote: '標準差（σ）取最近 20 期未預期盈餘（UE）樣本估計，這裡只列出構成本季 UE 的 2 期（本季/去年同季）原始欄位，20 期樣本本身不逐筆列出。',
  };
};
