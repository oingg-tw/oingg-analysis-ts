import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import type { MetricProvenanceResult } from '../../shared/provenance/provenanceTypes';
import { resolveCashFlowPerShareInputs, type CashFlowPerShareDeps } from '../cashFlowPerShare/computeCashFlowPerShare';
import { cashFlowPerShareEntries, cashFlowPerShareGateNote } from '../cashFlowPerShare/cashFlowPerShareProvenanceEntries';

// 2026-09-15 應 web-nuxt「營收到股利去了哪裡」瀑布圖卡片需求新增——
// depreciationAmortisationPerShare(TTM) = 近四季（折舊費用+攤銷費用）加總×1000（千元換元）/ 流通在外普通股（本季報告日）。
// 股數用 reportDate 不是 knowledgeDate（不涉及股價）。固定回傳 TTM（跟其餘試點慣例一致）。
//
// 2026-10-01 跟同家族 ocfPerShare／fcfPerShare 一起改成共用 resolveCashFlowPerShareInputs（那兩支漏了家族完整度條件、跟寫入分岔），
// 值直接取 resolution.depreciationAmortizationPerShareTtmCalc.value，不可能再跟寫入路徑分岔。

export const getDepreciationAmortisationPerShareProvenance = async (query: QuarterlyMetricQuery, deps: CashFlowPerShareDeps): Promise<MetricProvenanceResult> => {
  const r = await resolveCashFlowPerShareInputs(query, deps);

  if (!r) {
    return { symbol: query.symbol, metricCode: 'depreciationAmortisationPerShare', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  return {
    symbol: r.symbol,
    metricCode: 'depreciationAmortisationPerShare',
    found: true,
    fiscalYear: r.fiscalYear,
    fiscalQuarter: r.seasonNum,
    value: r.depreciationAmortizationPerShareTtmCalc.value,
    entries: cashFlowPerShareEntries(r, ['depreciation', 'amortization']),
    methodologyNote: cashFlowPerShareGateNote(r),
  };
};
