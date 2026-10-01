import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import type { MetricProvenanceResult } from '../../shared/provenance/provenanceTypes';
import { resolveCashFlowValuationInputs, type CashFlowValuationFamilyDeps } from '@/application/metrics/shared/cashFlowValuationFamily/computeCashFlowValuationFamily';
import { cashFlowValuationEntries, cashFlowValuationGateNote } from '@/application/metrics/shared/cashFlowValuationFamily/cashFlowValuationProvenanceEntries';

// 2026-09-13 使用者要求擴大稽核鏈——debtToFcf = 有息負債(本季期末快照) / FCF(TTM，OCF+資本支出加總)。固定回傳 TTM。
//
// 2026-10-01 改成跟 computeCashFlowValuationFamily 共用 resolveCashFlowValuationInputs：原本獨立重算，少了寫入路徑
// 2026-09-22 加的 FCF ≤ 0 守門（2317、1301 寫入 zero_or_negative_denominator、溯源卻是負的年數）跟家族 ttmComplete 旗標
// （金控寫入 insufficient_history、溯源卻是 0）。值直接取 resolution.values.debtToFcf。

export const getDebtToFcfProvenance = async (query: QuarterlyMetricQuery, deps: CashFlowValuationFamilyDeps): Promise<MetricProvenanceResult> => {
  const r = await resolveCashFlowValuationInputs(query, deps);

  if (!r) {
    return { symbol: query.symbol, metricCode: 'debtToFcf', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  return {
    symbol: r.symbol,
    metricCode: 'debtToFcf',
    found: true,
    fiscalYear: r.fiscalYear,
    fiscalQuarter: r.seasonNum,
    value: r.values.debtToFcf,
    entries: cashFlowValuationEntries(r, ['debt', 'ocf', 'capex']),
    methodologyNote:
      `分子有息負債 = 上方各筆借款／公司債／票券相加，有息負債＝${r.totalDebt ?? 'null'}。` +
      `分母 FCF(TTM) = OCF + 資本支出（資本支出帶負號，相加即為扣除），FCF(TTM)＝${r.ttmComplete ? r.fcfTtmSum.toString() : 'null'}；FCF ≤ 0 時「幾年還完」沒有意義，不計算。` +
      cashFlowValuationGateNote(r),
  };
};
