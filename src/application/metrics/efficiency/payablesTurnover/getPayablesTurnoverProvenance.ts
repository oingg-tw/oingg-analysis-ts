import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { calculatePayablesTurnover } from '../../../../domain/metrics/efficiency/payablesTurnover/calculatePayablesTurnover';
import { resolveTurnoverRatioProvenanceInputs } from '../turnoverRatio/resolveTurnoverRatioProvenanceInputs';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-13 使用者要求擴大稽核鏈——payablesTurnover = 營業成本(TTM) / 本季期末應付帳款，
// 見 resolveTurnoverRatioProvenanceInputs.ts 的共用查詢說明。固定回傳 TTM。

export const getPayablesTurnoverProvenance = async (query: QuarterlyMetricQuery, deps: PitDeps): Promise<MetricProvenanceResult> => {
  const resolution = await resolveTurnoverRatioProvenanceInputs(query, deps);
  if (!resolution) {
    return { symbol: query.symbol, metricCode: 'payablesTurnover', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { symbol, fiscalYear, fiscalQuarter, accountsPayable, ttmQuarters, ttmOperatingCosts, ttmComplete, costTtmSum } = resolution;
  const result = ttmComplete ? calculatePayablesTurnover(costTtmSum, accountsPayable) : { value: null, nullReason: 'insufficient_history' as const };

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

  return { symbol, metricCode: 'payablesTurnover', found: true, fiscalYear, fiscalQuarter, value: result.value, entries, methodologyNote: null };
};
