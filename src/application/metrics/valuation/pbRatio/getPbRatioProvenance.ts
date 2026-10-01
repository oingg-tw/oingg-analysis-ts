import { pickEquityWithFieldKey as pickEquity } from '@/domain/metrics/shared/pickers';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import { commonShareEntries } from '../../shared/provenance/shareEntries';
import { resolvePbRatioInputs, type PbRatioDeps } from './computePbRatio';

// 2026-09-13 使用者要求擴大稽核鏈——pbRatio = 股價(knowledge_date) / BVPS(本季期末普通股權益×1000(千元換元)/流通在外普通股)。
// 只有 Q 一種 basis。
//
// 2026-10-01 改成跟 computePbRatio 共用 resolvePbRatioInputs：原本這裡自己重算，中繼 BVPS 四捨五入、也沒扣特別股清償金額
// （2881 溯源 1.41 vs 寫入 1.53）。值直接取 resolution.pbRatio。

export const getPbRatioProvenance = async (query: QuarterlyMetricQuery, deps: PbRatioDeps): Promise<MetricProvenanceResult> => {
  const r = await resolvePbRatioInputs(query, deps);

  if (!r) {
    return { symbol: query.symbol, metricCode: 'pbRatio', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const equity = pickEquity(r.balanceSheet);
  const entries: ProvenanceEntry[] = [
    {
      role: '股價（該季知識時點）',
      fiscalYear: r.fiscalYear,
      fiscalQuarter: r.seasonNum,
      type: 'other',
      statementType: null,
      fieldKey: null,
      sourceDescription: r.stockPrice ? `證交所／櫃買中心每日收盤價（實際交易日 ${r.stockPrice.tradeDate}）` : null,
      value: toProvenanceEntryValue(r.stockPrice?.closePrice ?? null),
    },
    { role: '本季期末淨值（BVPS 分子，扣特別股清償金額前）', fiscalYear: r.fiscalYear, fiscalQuarter: r.seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: equity.fieldKey, sourceDescription: null, value: toProvenanceEntryValue(equity.value) },
    ...commonShareEntries(r.shares, r.fiscalYear, r.seasonNum, { preferredClaim: true }),
  ];

  return {
    symbol: r.symbol,
    metricCode: 'pbRatio',
    found: true,
    fiscalYear: r.fiscalYear,
    fiscalQuarter: r.seasonNum,
    value: r.pbRatio,
    entries,
    methodologyNote: `BVPS 不是財報原始欄位，是 (淨值 − 特別股清償金額) × 1000（千元換元）÷ 流通在外普通股算出的中繼值（不四捨五入）。BVPS＝${r.bvps ?? 'null'}。`,
  };
};
