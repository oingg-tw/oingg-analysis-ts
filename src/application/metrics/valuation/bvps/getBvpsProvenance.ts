import { pickEquityWithFieldKey as pickEquity } from '@/domain/metrics/shared/pickers';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import { commonShareEntries } from '../../shared/provenance/shareEntries';
import { resolveBvpsInputs, type BvpsDeps } from './computeBvps';

// 2026-09-13 使用者要求擴大稽核鏈——bvps = (本季期末淨值 − 特別股清償金額)×1000(千元換元) / 流通在外普通股。
// 淨值優先採歸屬母公司口徑，缺漏退回整體口徑。只有 Q 一種 basis，沒有 TTM/年化概念（資產負債表時點快照）。
//
// 2026-10-01 改成跟 computeBvps 共用 resolveBvpsInputs：原本這裡自己重算，沒扣特別股清償金額（v2/v3），2881 溯源 90.5 vs
// 寫入 83.65。值直接取 resolution.bvps。

export const getBvpsProvenance = async (query: QuarterlyMetricQuery, deps: BvpsDeps): Promise<MetricProvenanceResult> => {
  const r = await resolveBvpsInputs(query, deps);

  if (!r) {
    return { symbol: query.symbol, metricCode: 'bvps', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const equity = pickEquity(r.balanceSheet);
  const entries: ProvenanceEntry[] = [
    { role: '本季期末淨值（扣特別股清償金額前）', fiscalYear: r.fiscalYear, fiscalQuarter: r.seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: equity.fieldKey, sourceDescription: null, value: toProvenanceEntryValue(equity.value) },
    ...commonShareEntries(r.shares, r.fiscalYear, r.seasonNum, { preferredClaim: true }),
  ];

  return {
    symbol: r.symbol,
    metricCode: 'bvps',
    found: true,
    fiscalYear: r.fiscalYear,
    fiscalQuarter: r.seasonNum,
    value: r.bvps,
    entries,
    methodologyNote: 'BVPS = (淨值 − 特別股清償金額) × 1000（千元換元）÷ 流通在外普通股（只算普通股的每股淨值）。',
  };
};
