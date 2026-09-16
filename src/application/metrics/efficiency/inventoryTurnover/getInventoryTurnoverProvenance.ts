import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { calculateInventoryTurnover } from '../../../../domain/metrics/efficiency/inventoryTurnover/calculateInventoryTurnover';
import { resolveTurnoverRatioProvenanceInputs } from '../turnoverRatio/resolveTurnoverRatioProvenanceInputs';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-13 使用者要求擴大稽核鏈——inventoryTurnover = 營業成本(TTM) / 本季期末存貨，
// 見 resolveTurnoverRatioProvenanceInputs.ts 的共用查詢說明。固定回傳 TTM。

export const getInventoryTurnoverProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const resolution = await resolveTurnoverRatioProvenanceInputs(query);
  if (!resolution) {
    return { symbol: query.symbol, metricCode: 'inventoryTurnover', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { symbol, fiscalYear, fiscalQuarter, inventory, ttmQuarters, ttmOperatingCosts, ttmComplete, costTtmSum } = resolution;
  const result = ttmComplete ? calculateInventoryTurnover(costTtmSum, inventory) : { value: null, nullReason: 'insufficient_history' as const };

  const entries: ProvenanceEntry[] = [
    ...ttmQuarters.map(
      (tq, i): ProvenanceEntry => ({
        role: `TTM 營業成本（第 ${i + 1}/4 季）`,
        fiscalYear: rocYearToGregorian(Number(tq.year)),
        fiscalQuarter: Number(tq.season),
        type: 'statementField',
        statementType: 'incomeStatement',
        fieldKey: 'operating_costs',
        sourceDescription: null,
        value: toProvenanceEntryValue(ttmOperatingCosts[i]),
      })
    ),
    {
      role: '本季期末存貨',
      fiscalYear,
      fiscalQuarter,
      type: 'statementField',
      statementType: 'balanceSheet',
      fieldKey: 'inventories',
      sourceDescription: null,
      value: toProvenanceEntryValue(inventory),
    },
  ];

  return { symbol, metricCode: 'inventoryTurnover', found: true, fiscalYear, fiscalQuarter, value: result.value, entries, methodologyNote: null };
};
