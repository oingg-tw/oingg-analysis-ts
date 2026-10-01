import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import type { MetricProvenanceResult } from '../../shared/provenance/provenanceTypes';
import { resolveCashFlowValuationInputs, type CashFlowValuationFamilyDeps } from '@/application/metrics/shared/cashFlowValuationFamily/computeCashFlowValuationFamily';
import { cashFlowValuationEntries, cashFlowValuationGateNote } from '@/application/metrics/shared/cashFlowValuationFamily/cashFlowValuationProvenanceEntries';

// 2026-09-13 使用者要求擴大稽核鏈——capexToOcfRatio = |近四季資本支出加總| / 近四季營業活動現金流加總 × 100。固定回傳 TTM。
//
// 2026-10-01 改成跟 computeCashFlowValuationFamily 共用 resolveCashFlowValuationInputs。原本這裡刻意「只依自己的依賴
// （OCF／資本支出）重查、不引入家族 ttmComplete 旗標」，結果溯源表跟寫入的值對不上：寫入路徑 2026-09-22 起 OCF ≤ 0 就
// 不算（zero_or_negative_denominator），金控等營收缺漏的公司整批 insufficient_history，溯源卻照樣算出數字。
// 使用者要的是「溯源表的值＝寫入的值」，所以值直接取 resolution.values.capexToOcfRatio。

export const getCapexToOcfRatioProvenance = async (query: QuarterlyMetricQuery, deps: CashFlowValuationFamilyDeps): Promise<MetricProvenanceResult> => {
  const r = await resolveCashFlowValuationInputs(query, deps);

  if (!r) {
    return { symbol: query.symbol, metricCode: 'capexToOcfRatio', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  return {
    symbol: r.symbol,
    metricCode: 'capexToOcfRatio',
    found: true,
    fiscalYear: r.fiscalYear,
    fiscalQuarter: r.seasonNum,
    value: r.values.capexToOcfRatio,
    entries: cashFlowValuationEntries(r, ['ocf', 'capex']),
    methodologyNote:
      '分子取資本支出加總後的絕對值（原始資料是投資活動現金流出，帶負號）再除以營業活動現金流，比率本身恆為正數；近一年營業活動現金流 ≤ 0 時比率沒有意義，不計算。' +
      cashFlowValuationGateNote(r),
  };
};
