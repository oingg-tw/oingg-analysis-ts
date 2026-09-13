import { rocYearToGregorian } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { calculatePayablesTurnover } from '../payablesTurnover/calculatePayablesTurnover';
import { calculatePayablesDays } from './calculatePayablesDays';
import { resolveTurnoverRatioProvenanceInputs } from '../turnoverRatio/resolveTurnoverRatioProvenanceInputs';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-13 使用者要求擴大稽核鏈——payablesDays(DPO) = 365 / 應付帳款周轉率(TTM)，
// 是 payablesTurnover 的衍生轉換，見 getInventoryDaysProvenance.ts 同一個模式的說明。

export const getPayablesDaysProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const resolution = await resolveTurnoverRatioProvenanceInputs(query);
  if (!resolution) {
    return { symbol: query.symbol, metricCode: 'payablesDays', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { symbol, fiscalYear, fiscalQuarter, accountsPayable, ttmQuarters, ttmOperatingCosts, ttmComplete, costTtmSum } = resolution;
  const turnover = ttmComplete ? calculatePayablesTurnover(costTtmSum, accountsPayable) : { value: null, quarterlyAnnualized: null, nullReason: 'insufficient_history' as const };
  const result = calculatePayablesDays(turnover.value, turnover.nullReason);

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
    metricCode: 'payablesDays',
    found: true,
    fiscalYear,
    fiscalQuarter,
    value: result.value,
    entries,
    methodologyNote: `DPO = 365 ÷ 應付帳款周轉率(TTM)，周轉率本身 = TTM 營業成本 ÷ 本季期末應付帳款（見上方原始欄位），這裡不是查回一組獨立的原始欄位。周轉率(TTM)＝${turnover.value ?? 'null'}。`,
  };
};
