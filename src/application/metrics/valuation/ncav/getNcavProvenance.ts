import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import { resolveNcavInputs, type NcavDeps } from './computeNcav';

// 2026-09-13 使用者要求擴大稽核鏈——ncav = (流動資產 - 總負債 - 特別股清償金額) × 1000（千元換元換算成公司總額），回傳公司
// 總額不除以股數。只有 Q 一種 basis（資產負債表時點快照）。
//
// 2026-10-01 改成跟 computeNcav 共用 resolveNcavInputs：原本這裡自己重算，特別股還是扣資產負債表面額，沒跟上 2026-09-27 的
// 「扣發行價」（1101 溯源 −1,033.7 億 vs 寫入 −1,113.7 億）。值直接取 resolution.ncav；兩種特別股金額都列出來對照。

export const getNcavProvenance = async (query: QuarterlyMetricQuery, deps: NcavDeps): Promise<MetricProvenanceResult> => {
  const r = await resolveNcavInputs(query, deps);

  if (!r) {
    return { symbol: query.symbol, metricCode: 'ncav', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const at = { fiscalYear: r.fiscalYear, fiscalQuarter: r.seasonNum };
  const entries: ProvenanceEntry[] = [
    { role: '本季期末流動資產', ...at, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'current_assets', sourceDescription: null, value: toProvenanceEntryValue(r.currentAssets) },
    { role: '本季期末總負債', ...at, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'liabilities', sourceDescription: null, value: toProvenanceEntryValue(r.totalLiabilities) },
    { role: '本季期末特別股股本（面額；查不到發行價時才用它扣）', ...at, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'preference_share', sourceDescription: null, value: toProvenanceEntryValue(r.balanceSheet?.preferredStockCapital ?? null) },
    {
      role: '特別股清償金額（千元，按發行價；實際扣除的金額）',
      ...at,
      type: 'other',
      statementType: null,
      fieldKey: null,
      sourceDescription: r.preferredClaim !== undefined ? '特別股股本＋股利公告的發行價' : '沒有特別股或查不到發行價，改扣上一列的面額（缺漏視為 0）',
      value: toProvenanceEntryValue(r.preferredStockCapital),
    },
  ];

  return { symbol: r.symbol, metricCode: 'ncav', found: true, fiscalYear: r.fiscalYear, fiscalQuarter: r.seasonNum, value: r.ncav, entries, methodologyNote: null };
};
