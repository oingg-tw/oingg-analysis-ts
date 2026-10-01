import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import type { MetricProvenanceResult } from '../../shared/provenance/provenanceTypes';
import { resolveCashFlowPerShareInputs, type CashFlowPerShareDeps } from '../cashFlowPerShare/computeCashFlowPerShare';
import { cashFlowPerShareEntries, cashFlowPerShareGateNote } from '../cashFlowPerShare/cashFlowPerShareProvenanceEntries';

// 2026-09-13 使用者要求擴大稽核鏈——ocfPerShare(TTM) = 近四季營業活動現金流加總×1000(千元換元) / 流通在外普通股（本季報告日）。
// 股數用 reportDate 不是 knowledgeDate（不涉及股價）。固定回傳 TTM（該指標同時有 Q/Q_ANN，這裡跟其餘試點慣例一致優先選 TTM）。
//
// 2026-10-01 改成跟 computeCashFlowPerShare 共用 resolveCashFlowPerShareInputs：原本只看 OCF 自己齊不齊，漏了家族共用的完整度
// 條件（興櫃 1480、1594、2255 寫入 insufficient_history、溯源卻有值）。值直接取 resolution.ocfPerShareTtmCalc.value。

export const getOcfPerShareProvenance = async (query: QuarterlyMetricQuery, deps: CashFlowPerShareDeps): Promise<MetricProvenanceResult> => {
  const r = await resolveCashFlowPerShareInputs(query, deps);

  if (!r) {
    return { symbol: query.symbol, metricCode: 'ocfPerShare', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  return {
    symbol: r.symbol,
    metricCode: 'ocfPerShare',
    found: true,
    fiscalYear: r.fiscalYear,
    fiscalQuarter: r.seasonNum,
    value: r.ocfPerShareTtmCalc.value,
    entries: cashFlowPerShareEntries(r, ['ocf']),
    methodologyNote: cashFlowPerShareGateNote(r),
  };
};
