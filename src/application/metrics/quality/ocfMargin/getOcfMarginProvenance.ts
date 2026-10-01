import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import type { MetricProvenanceResult } from '../../shared/provenance/provenanceTypes';
import { resolveCashFlowValuationInputs, type CashFlowValuationFamilyDeps } from '@/application/metrics/shared/cashFlowValuationFamily/computeCashFlowValuationFamily';
import { cashFlowValuationEntries, cashFlowValuationGateNote } from '@/application/metrics/shared/cashFlowValuationFamily/cashFlowValuationProvenanceEntries';

// 2026-09-13 使用者要求擴大稽核鏈——ocfMargin(TTM) = 近四季營業活動現金流加總 / 近四季
// 營收加總。純財報比率，不涉及股價/市值。只有 TTM 一種 basis。
//
// 2026-10-01 改成跟 computeCashFlowValuationFamily 共用 resolveCashFlowValuationInputs（原本「只查自己的依賴、不用家族
// ttmComplete 旗標」，同家族其他溯源表因此跟寫入的值分岔），值直接取 resolution.values.ocfMargin。
// resolver 會多查一次市值（這支用不到），換來「溯源＝寫入」不可能再漂移，值得。

export const getOcfMarginProvenance = async (query: QuarterlyMetricQuery, deps: CashFlowValuationFamilyDeps): Promise<MetricProvenanceResult> => {
  const r = await resolveCashFlowValuationInputs(query, deps);

  if (!r) {
    return { symbol: query.symbol, metricCode: 'ocfMargin', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const gateNote = cashFlowValuationGateNote(r);
  return {
    symbol: r.symbol,
    metricCode: 'ocfMargin',
    found: true,
    fiscalYear: r.fiscalYear,
    fiscalQuarter: r.seasonNum,
    value: r.values.ocfMargin,
    entries: cashFlowValuationEntries(r, ['revenue', 'ocf']),
    methodologyNote: gateNote || null,
  };
};
