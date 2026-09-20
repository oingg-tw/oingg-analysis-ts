import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { calculateInventoryTurnover } from '../../../../domain/metrics/efficiency/inventoryTurnover/calculateInventoryTurnover';
import { calculateInventoryDays } from '../../../../domain/metrics/efficiency/inventoryDays/calculateInventoryDays';
import { resolveTurnoverRatioProvenanceInputs } from '../turnoverRatio/resolveTurnoverRatioProvenanceInputs';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-13 使用者要求擴大稽核鏈——inventoryDays(DIO) = 365 / 存貨周轉率(TTM)，是
// inventoryTurnover 的衍生轉換，不是獨立查詢的原始欄位，所以稽核鏈列出的原始欄位跟
// getInventoryTurnoverProvenance.ts 完全一樣（本季期末存貨 + TTM 營業成本），
// methodologyNote 說明這層轉換。共用 resolveTurnoverRatioProvenanceInputs。

export const getInventoryDaysProvenance = async (query: QuarterlyMetricQuery, deps: PitDeps): Promise<MetricProvenanceResult> => {
  const resolution = await resolveTurnoverRatioProvenanceInputs(query, deps);
  if (!resolution) {
    return { symbol: query.symbol, metricCode: 'inventoryDays', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { symbol, fiscalYear, fiscalQuarter, inventory, ttmQuarters, ttmOperatingCosts, ttmComplete, costTtmSum } = resolution;
  const turnover = ttmComplete ? calculateInventoryTurnover(costTtmSum, inventory) : { value: null, nullReason: 'insufficient_history' as const };
  const result = calculateInventoryDays(turnover.value, turnover.nullReason);

  const entries: ProvenanceEntry[] = [
    ...ttmQuarters.map(
      (tq, i): ProvenanceEntry => ({
        role: `近四季 營業成本（第 ${i + 1}/4 季）`,
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

  return {
    symbol,
    metricCode: 'inventoryDays',
    found: true,
    fiscalYear,
    fiscalQuarter,
    value: result.value,
    entries,
    methodologyNote: `DIO = 365 ÷ 存貨周轉率(TTM)，周轉率本身 = TTM 營業成本 ÷ 本季期末存貨（見上方原始欄位），這裡不是查回一組獨立的原始欄位。周轉率(TTM)＝${turnover.value ?? 'null'}。`,
  };
};
