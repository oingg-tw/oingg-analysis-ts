import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import type { MetricProvenanceResult } from '../../shared/provenance/provenanceTypes';
import { resolveCashFlowValuationInputs, type CashFlowValuationFamilyDeps } from '@/application/metrics/shared/cashFlowValuationFamily/computeCashFlowValuationFamily';
import { cashFlowValuationEntries, cashFlowValuationGateNote } from '@/application/metrics/shared/cashFlowValuationFamily/cashFlowValuationProvenanceEntries';

// 2026-09-13 使用者要求擴大稽核鏈——evToSales(TTM) = 企業價值(EV=市值+淨負債，本季知識
// 時點) / 近四季營收加總。只有 TTM 一種 basis。
//
// 2026-10-01 改成跟 computeCashFlowValuationFamily 共用 resolveCashFlowValuationInputs（同家族 croic／debtToFcf 等溯源表
// 漂掉之後一起收斂），值直接取 resolution.values.evToSales，不可能再跟寫入路徑分岔。

export const getEvToSalesProvenance = async (query: QuarterlyMetricQuery, deps: CashFlowValuationFamilyDeps): Promise<MetricProvenanceResult> => {
  const r = await resolveCashFlowValuationInputs(query, deps);

  if (!r) {
    return { symbol: query.symbol, metricCode: 'evToSales', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  return {
    symbol: r.symbol,
    metricCode: 'evToSales',
    found: true,
    fiscalYear: r.fiscalYear,
    fiscalQuarter: r.seasonNum,
    value: r.values.evToSales,
    entries: cashFlowValuationEntries(r, ['debt', 'cash', 'marketCap', 'revenue']),
    methodologyNote: `EV(企業價值) = 市值 + 淨負債(有息負債-現金及約當現金)，EV＝${r.enterpriseValue ?? 'null'}。` + cashFlowValuationGateNote(r),
  };
};
