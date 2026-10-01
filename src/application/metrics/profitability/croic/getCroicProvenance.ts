import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import type { MetricProvenanceResult } from '../../shared/provenance/provenanceTypes';
import { resolveCashFlowValuationInputs, type CashFlowValuationFamilyDeps } from '@/application/metrics/shared/cashFlowValuationFamily/computeCashFlowValuationFamily';
import { cashFlowValuationEntries, cashFlowValuationGateNote } from '@/application/metrics/shared/cashFlowValuationFamily/cashFlowValuationProvenanceEntries';

// 2026-09-13 使用者要求擴大稽核鏈——croic(TTM) = FCF(TTM，OCF+資本支出加總) / 投入資本
// （本季期末快照，有息負債+權益-現金）× 100。固定回傳 TTM。
//
// 2026-10-01 改成跟 computeCashFlowValuationFamily 共用 resolveCashFlowValuationInputs：原本這裡「只查自己真正的依賴」
// 獨立重算，結果沒跟上 v2 的 ×100（溯源 0.26、寫入 26.41），也沒有家族共用的 ttmComplete 旗標（金控沒有營業收入 →
// 寫入 insufficient_history、溯源卻有值）。值直接取 resolution.values.croic，不可能再跟寫入路徑分岔。

export const getCroicProvenance = async (query: QuarterlyMetricQuery, deps: CashFlowValuationFamilyDeps): Promise<MetricProvenanceResult> => {
  const r = await resolveCashFlowValuationInputs(query, deps);

  if (!r) {
    return { symbol: query.symbol, metricCode: 'croic', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  return {
    symbol: r.symbol,
    metricCode: 'croic',
    found: true,
    fiscalYear: r.fiscalYear,
    fiscalQuarter: r.seasonNum,
    value: r.values.croic,
    entries: cashFlowValuationEntries(r, ['debt', 'equity', 'cash', 'ocf', 'capex']),
    methodologyNote:
      `croic = FCF(TTM) ÷ 投入資本 × 100。分母投入資本 = 有息負債（上方各筆借款／公司債／票券相加）+ 權益 − 現金及約當現金（本季期末快照），投入資本＝${r.investedCapital ?? 'null'}。` +
      `分子 FCF(TTM) = OCF + 資本支出（資本支出帶負號，相加即為扣除），FCF(TTM)＝${r.ttmComplete ? r.fcfTtmSum.toString() : 'null'}。` +
      cashFlowValuationGateNote(r),
  };
};
