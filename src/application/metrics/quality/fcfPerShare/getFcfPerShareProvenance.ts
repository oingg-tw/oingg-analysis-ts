import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import type { MetricProvenanceResult } from '../../shared/provenance/provenanceTypes';
import { resolveCashFlowPerShareInputs, type CashFlowPerShareDeps } from '../cashFlowPerShare/computeCashFlowPerShare';
import { cashFlowPerShareEntries, cashFlowPerShareGateNote } from '../cashFlowPerShare/cashFlowPerShareProvenanceEntries';

// 2026-09-13 使用者要求擴大稽核鏈——fcfPerShare(TTM) = 近四季自由現金流(FCF=OCF+資本支出)加總×1000(千元換元) / 流通在外普通股
// （本季報告日）。股數用 reportDate 不是 knowledgeDate。固定回傳 TTM（該指標同時有 Q/Q_ANN，這裡跟其餘試點慣例一致優先選 TTM）。
//
// 2026-10-01 改成跟 computeCashFlowPerShare 共用 resolveCashFlowPerShareInputs：原本只看 OCF／資本支出齊不齊，漏了家族共用的完整度
// 條件（興櫃 1480、1594、2255 寫入 insufficient_history、溯源卻有值）。值直接取 resolution.fcfPerShareTtmCalc.value。

export const getFcfPerShareProvenance = async (query: QuarterlyMetricQuery, deps: CashFlowPerShareDeps): Promise<MetricProvenanceResult> => {
  const r = await resolveCashFlowPerShareInputs(query, deps);

  if (!r) {
    return { symbol: query.symbol, metricCode: 'fcfPerShare', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const gateNote = cashFlowPerShareGateNote(r);
  return {
    symbol: r.symbol,
    metricCode: 'fcfPerShare',
    found: true,
    fiscalYear: r.fiscalYear,
    fiscalQuarter: r.seasonNum,
    value: r.fcfPerShareTtmCalc.value,
    entries: cashFlowPerShareEntries(r, ['ocf', 'capex']),
    methodologyNote: `FCF = 營業活動現金流 + 資本支出（資本支出帶負號，相加即為扣除）。近一年 FCF＝${r.fcfTtmSum ?? 'null'}。${gateNote ?? ''}`,
  };
};
