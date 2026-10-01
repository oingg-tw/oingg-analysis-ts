import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import type { MetricProvenanceResult } from '../../shared/provenance/provenanceTypes';
import { resolveCashFlowValuationInputs, type CashFlowValuationFamilyDeps } from '@/application/metrics/shared/cashFlowValuationFamily/computeCashFlowValuationFamily';
import { cashFlowValuationEntries, cashFlowValuationGateNote } from '@/application/metrics/shared/cashFlowValuationFamily/cashFlowValuationProvenanceEntries';

// 2026-09-13 使用者要求擴大稽核鏈——priceToOcf(TTM) = 市值(本季知識時點，不是企業價值)
// / 近四季營業活動現金流加總——這支用市值不是 EV（跟 evToOcf 不同）。只有 TTM 一種 basis。
//
// 2026-10-01 改成跟 computeCashFlowValuationFamily 共用 resolveCashFlowValuationInputs：原本「只查自己的依賴、不用家族
// ttmComplete 旗標」，金控（沒有營業收入）寫入 insufficient_history、溯源卻有值。值直接取 resolution.values.priceToOcf。

export const getPriceToOcfProvenance = async (query: QuarterlyMetricQuery, deps: CashFlowValuationFamilyDeps): Promise<MetricProvenanceResult> => {
  const r = await resolveCashFlowValuationInputs(query, deps);

  if (!r) {
    return { symbol: query.symbol, metricCode: 'priceToOcf', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const gateNote = cashFlowValuationGateNote(r);
  return {
    symbol: r.symbol,
    metricCode: 'priceToOcf',
    found: true,
    fiscalYear: r.fiscalYear,
    fiscalQuarter: r.seasonNum,
    value: r.values.priceToOcf,
    entries: cashFlowValuationEntries(r, ['marketCap', 'ocf']),
    methodologyNote: gateNote || null,
  };
};
