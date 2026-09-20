import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { calculateInventoryTurnover } from '../../../../domain/metrics/efficiency/inventoryTurnover/calculateInventoryTurnover';
import { calculateReceivablesTurnover } from '../../../../domain/metrics/efficiency/receivablesTurnover/calculateReceivablesTurnover';
import { calculatePayablesTurnover } from '../../../../domain/metrics/efficiency/payablesTurnover/calculatePayablesTurnover';
import { calculateInventoryDays } from '../../../../domain/metrics/efficiency/inventoryDays/calculateInventoryDays';
import { calculateReceivablesDays } from '../../../../domain/metrics/efficiency/receivablesDays/calculateReceivablesDays';
import { calculatePayablesDays } from '../../../../domain/metrics/efficiency/payablesDays/calculatePayablesDays';
import { calculateCashConversionCycle } from '../../../../domain/metrics/efficiency/cashConversionCycle/calculateCashConversionCycle';
import { resolveTurnoverRatioProvenanceInputs } from '../turnoverRatio/resolveTurnoverRatioProvenanceInputs';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-13 使用者要求擴大稽核鏈——cashConversionCycle(CCC) = DIO + DSO − DPO，是三支
// 天數指標（各自又是對應周轉率的衍生轉換）的二階衍生值，見 getInventoryDaysProvenance.ts
// 同一個模式的說明。稽核鏈列出全部 5 個真正的原始欄位（TTM 營業成本、TTM 營收、本季期末
// 存貨/應收帳款/應付帳款），methodologyNote 說明完整的推導鏈。共用
// resolveTurnoverRatioProvenanceInputs（一次查詢就有齊全部 5 個欄位）。

export const getCashConversionCycleProvenance = async (query: QuarterlyMetricQuery, deps: PitDeps): Promise<MetricProvenanceResult> => {
  const resolution = await resolveTurnoverRatioProvenanceInputs(query, deps);
  if (!resolution) {
    return { symbol: query.symbol, metricCode: 'cashConversionCycle', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { symbol, fiscalYear, fiscalQuarter, inventory, accountsReceivable, accountsPayable, ttmQuarters, ttmOperatingCosts, ttmOperatingRevenues, ttmComplete, costTtmSum, revenueTtmSum } = resolution;

  const inventoryTurnover = ttmComplete ? calculateInventoryTurnover(costTtmSum, inventory) : { value: null, nullReason: 'insufficient_history' as const };
  const receivablesTurnover = ttmComplete ? calculateReceivablesTurnover(revenueTtmSum, accountsReceivable) : { value: null, nullReason: 'insufficient_history' as const };
  const payablesTurnover = ttmComplete ? calculatePayablesTurnover(costTtmSum, accountsPayable) : { value: null, nullReason: 'insufficient_history' as const };

  const inventoryDays = calculateInventoryDays(inventoryTurnover.value, inventoryTurnover.nullReason);
  const receivablesDays = calculateReceivablesDays(receivablesTurnover.value, receivablesTurnover.nullReason);
  const payablesDays = calculatePayablesDays(payablesTurnover.value, payablesTurnover.nullReason);

  const result = calculateCashConversionCycle(inventoryDays.value, receivablesDays.value, payablesDays.value);

  const entries: ProvenanceEntry[] = [
    ...ttmQuarters.map(
      (tq, i): ProvenanceEntry => ({
        role: `近四季 營業成本（第 ${i + 1}/4 季，用於 DIO/DPO）`,
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
        role: `近四季 營收（第 ${i + 1}/4 季，用於 DSO）`,
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
    {
      role: '本季期末應付帳款',
      fiscalYear,
      fiscalQuarter,
      type: 'statementField',
      statementType: 'balanceSheet',
      fieldKey: 'trade_payables_to_trade_suppliers',
      sourceDescription: null,
      value: toProvenanceEntryValue(accountsPayable),
    },
  ];

  return {
    symbol,
    metricCode: 'cashConversionCycle',
    found: true,
    fiscalYear,
    fiscalQuarter,
    value: result.value,
    entries,
    methodologyNote: `CCC = DIO + DSO − DPO。DIO(TTM)＝${inventoryDays.value ?? 'null'}，DSO(TTM)＝${receivablesDays.value ?? 'null'}，DPO(TTM)＝${payablesDays.value ?? 'null'}——三者各自是對應周轉率(TTM)的 365/x 轉換，周轉率則來自上方原始欄位，不是查回三組獨立資料。`,
  };
};
