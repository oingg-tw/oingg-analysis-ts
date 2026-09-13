import { rocYearToGregorian } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { calculateInventoryTurnover } from '../inventoryTurnover/calculateInventoryTurnover';
import { calculateReceivablesTurnover } from '../receivablesTurnover/calculateReceivablesTurnover';
import { calculateInventoryDays } from '../inventoryDays/calculateInventoryDays';
import { calculateReceivablesDays } from '../receivablesDays/calculateReceivablesDays';
import { calculateOperatingCycle } from './calculateOperatingCycle';
import { resolveTurnoverRatioProvenanceInputs } from '../turnoverRatio/resolveTurnoverRatioProvenanceInputs';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-13 使用者要求擴大稽核鏈——operatingCycle = DIO + DSO（不扣 DPO，跟
// cashConversionCycle 差異是不考慮付款緩衝期），見 getCashConversionCycleProvenance.ts
// 同一個模式的說明，只是少了應付帳款那組欄位。

export const getOperatingCycleProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const resolution = await resolveTurnoverRatioProvenanceInputs(query);
  if (!resolution) {
    return { symbol: query.symbol, metricCode: 'operatingCycle', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { symbol, fiscalYear, fiscalQuarter, inventory, accountsReceivable, ttmQuarters, ttmOperatingCosts, ttmOperatingRevenues, ttmComplete, costTtmSum, revenueTtmSum } = resolution;

  const inventoryTurnover = ttmComplete ? calculateInventoryTurnover(costTtmSum, inventory) : { value: null, quarterlyAnnualized: null, nullReason: 'insufficient_history' as const };
  const receivablesTurnover = ttmComplete ? calculateReceivablesTurnover(revenueTtmSum, accountsReceivable) : { value: null, quarterlyAnnualized: null, nullReason: 'insufficient_history' as const };

  const inventoryDays = calculateInventoryDays(inventoryTurnover.value, inventoryTurnover.nullReason);
  const receivablesDays = calculateReceivablesDays(receivablesTurnover.value, receivablesTurnover.nullReason);

  const result = calculateOperatingCycle(inventoryDays.value, receivablesDays.value);

  const entries: ProvenanceEntry[] = [
    ...ttmQuarters.map(
      (tq, i): ProvenanceEntry => ({
        role: `TTM 營業成本（第 ${i + 1}/4 季，用於 DIO）`,
        fiscalYear: rocYearToGregorian(Number(tq.year)),
        fiscalQuarter: Number(tq.season),
        type: 'statementField',
        statementType: 'incomeStatement',
        fieldKey: 'operating_costs',
        sourceDescription: null,
        value: toProvenanceEntryValue(ttmOperatingCosts[i]),
      })
    ),
    ...ttmQuarters.map(
      (tq, i): ProvenanceEntry => ({
        role: `TTM 營收（第 ${i + 1}/4 季，用於 DSO）`,
        fiscalYear: rocYearToGregorian(Number(tq.year)),
        fiscalQuarter: Number(tq.season),
        type: 'statementField',
        statementType: 'incomeStatement',
        fieldKey: 'revenue',
        sourceDescription: null,
        value: toProvenanceEntryValue(ttmOperatingRevenues[i]),
      })
    ),
    { role: '本季期末存貨', fiscalYear, fiscalQuarter, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'inventories', sourceDescription: null, value: toProvenanceEntryValue(inventory) },
    {
      role: '本季期末應收帳款',
      fiscalYear,
      fiscalQuarter,
      type: 'statementField',
      statementType: 'balanceSheet',
      fieldKey: 'accounts_receivable_net',
      sourceDescription: null,
      value: toProvenanceEntryValue(accountsReceivable),
    },
  ];

  return {
    symbol,
    metricCode: 'operatingCycle',
    found: true,
    fiscalYear,
    fiscalQuarter,
    value: result.value,
    entries,
    methodologyNote: `營運週期 = DIO + DSO。DIO(TTM)＝${inventoryDays.value ?? 'null'}，DSO(TTM)＝${receivablesDays.value ?? 'null'}——兩者各自是對應周轉率(TTM)的 365/x 轉換，周轉率則來自上方原始欄位，不是查回兩組獨立資料。`,
  };
};
