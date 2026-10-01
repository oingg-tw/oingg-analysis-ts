import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import type { MetricProvenanceResult } from '../../shared/provenance/provenanceTypes';
import { resolveCashFlowValuationInputs, type CashFlowValuationFamilyDeps } from '@/application/metrics/shared/cashFlowValuationFamily/computeCashFlowValuationFamily';
import { cashFlowValuationEntries, cashFlowValuationGateNote } from '@/application/metrics/shared/cashFlowValuationFamily/cashFlowValuationProvenanceEntries';

// 2026-09-13 使用者要求擴大稽核鏈——evToOcf(TTM) = 企業價值(EV=市值+淨負債，本季知識
// 時點) / 近四季營業活動現金流加總。只有 TTM 一種 basis。
//
// 2026-10-01 改成跟 computeCashFlowValuationFamily 共用 resolveCashFlowValuationInputs：原本「只查自己的依賴、不用家族
// ttmComplete 旗標」，金控（沒有營業收入）寫入 insufficient_history、溯源卻有值。值直接取 resolution.values.evToOcf。

export const getEvToOcfProvenance = async (query: QuarterlyMetricQuery, deps: CashFlowValuationFamilyDeps): Promise<MetricProvenanceResult> => {
  const r = await resolveCashFlowValuationInputs(query, deps);

  if (!r) {
    return { symbol: query.symbol, metricCode: 'evToOcf', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  return {
    symbol: r.symbol,
    metricCode: 'evToOcf',
    found: true,
    fiscalYear: r.fiscalYear,
    fiscalQuarter: r.seasonNum,
    value: r.values.evToOcf,
    entries: cashFlowValuationEntries(r, ['debt', 'cash', 'marketCap', 'ocf']),
    methodologyNote: `EV(企業價值) = 市值 + 淨負債(有息負債-現金及約當現金)，EV＝${r.enterpriseValue ?? 'null'}。` + cashFlowValuationGateNote(r),
  };
};
