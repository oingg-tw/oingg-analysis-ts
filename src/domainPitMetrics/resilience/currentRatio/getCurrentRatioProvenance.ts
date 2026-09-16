import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { calculateCurrentRatio } from './calculateCurrentRatio';
import { resolveLiquidityRatioProvenanceInputs } from '../liquidityRatio/resolveLiquidityRatioProvenanceInputs';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-13 使用者要求擴大稽核鏈——currentRatio(流動比率) = 流動資產 / 流動負債 × 100，
// 純資產負債表時點快照，只有 Q 一種 basis，沒有 TTM 概念。共用
// resolveLiquidityRatioProvenanceInputs。

export const getCurrentRatioProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const resolution = await resolveLiquidityRatioProvenanceInputs(query);
  if (!resolution) {
    return { symbol: query.symbol, metricCode: 'currentRatio', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { symbol, fiscalYear, fiscalQuarter, currentAssets, currentLiabilities } = resolution;
  const result = calculateCurrentRatio(currentAssets, currentLiabilities);

  const entries: ProvenanceEntry[] = [
    { role: '本季期末流動資產', fiscalYear, fiscalQuarter, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'current_assets', sourceDescription: null, value: toProvenanceEntryValue(currentAssets) },
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

  return { symbol, metricCode: 'currentRatio', found: true, fiscalYear, fiscalQuarter, value: result.value, entries, methodologyNote: null };
};
