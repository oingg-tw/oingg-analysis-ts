import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { calculateCashRatio } from './calculateCashRatio';
import { resolveLiquidityRatioProvenanceInputs } from '../liquidityRatio/resolveLiquidityRatioProvenanceInputs';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-13 使用者要求擴大稽核鏈——cashRatio(現金比率) = 現金及約當現金 / 流動負債 × 100，
// 純資產負債表時點快照，只有 Q 一種 basis。共用 resolveLiquidityRatioProvenanceInputs。

export const getCashRatioProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const resolution = await resolveLiquidityRatioProvenanceInputs(query);
  if (!resolution) {
    return { symbol: query.symbol, metricCode: 'cashRatio', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { symbol, fiscalYear, fiscalQuarter, cashAndEquivalents, currentLiabilities } = resolution;
  const result = calculateCashRatio(cashAndEquivalents, currentLiabilities);

  const entries: ProvenanceEntry[] = [
    {
      role: '本季期末現金及約當現金',
      fiscalYear,
      fiscalQuarter,
      type: 'statementField',
      statementType: 'balanceSheet',
      fieldKey: 'cash_and_cash_equivalents',
      sourceDescription: null,
      value: toProvenanceEntryValue(cashAndEquivalents),
    },
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

  return { symbol, metricCode: 'cashRatio', found: true, fiscalYear, fiscalQuarter, value: result.value, entries, methodologyNote: null };
};
