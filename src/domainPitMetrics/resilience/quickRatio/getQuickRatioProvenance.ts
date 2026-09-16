import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { calculateQuickRatio } from './calculateQuickRatio';
import { resolveLiquidityRatioProvenanceInputs } from '../liquidityRatio/resolveLiquidityRatioProvenanceInputs';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-13 使用者要求擴大稽核鏈——quickRatio(速動比率) = (流動資產−存貨) / 流動負債 × 100，
// 純資產負債表時點快照，只有 Q 一種 basis。共用 resolveLiquidityRatioProvenanceInputs，
// 稽核鏈分開列出流動資產/存貨/流動負債三筆原始欄位，不是只列相減後的速動資產。

export const getQuickRatioProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const resolution = await resolveLiquidityRatioProvenanceInputs(query);
  if (!resolution) {
    return { symbol: query.symbol, metricCode: 'quickRatio', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { symbol, fiscalYear, fiscalQuarter, currentAssets, inventory, currentLiabilities } = resolution;
  const result = calculateQuickRatio(currentAssets, inventory, currentLiabilities);
  const quickAssets = currentAssets !== null && inventory !== null ? currentAssets - inventory : null;

  const entries: ProvenanceEntry[] = [
    { role: '本季期末流動資產', fiscalYear, fiscalQuarter, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'current_assets', sourceDescription: null, value: toProvenanceEntryValue(currentAssets) },
    { role: '本季期末存貨', fiscalYear, fiscalQuarter, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'inventories', sourceDescription: null, value: toProvenanceEntryValue(inventory) },
    {
      role: '本季期末流動負債',
      fiscalYear,
      fiscalQuarter,
      type: 'statementField',
      statementType: 'balanceSheet',
      fieldKey: 'current_liabilities',
      sourceDescription: null,
      value: toProvenanceEntryValue(currentLiabilities),
    },
  ];

  return {
    symbol,
    metricCode: 'quickRatio',
    found: true,
    fiscalYear,
    fiscalQuarter,
    value: result.value,
    entries,
    methodologyNote: `分子速動資產 = 流動資產 − 存貨（見上方兩筆原始欄位相減），本身不是財報原始欄位。速動資產＝${quickAssets ?? 'null'}。`,
  };
};
