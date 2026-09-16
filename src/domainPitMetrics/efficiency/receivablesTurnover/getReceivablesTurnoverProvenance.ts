import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { calculateReceivablesTurnover } from './calculateReceivablesTurnover';
import { resolveTurnoverRatioProvenanceInputs } from '../turnoverRatio/resolveTurnoverRatioProvenanceInputs';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-13 使用者要求擴大稽核鏈——receivablesTurnover = 營收(TTM) / 本季期末應收帳款，
// 見 resolveTurnoverRatioProvenanceInputs.ts 的共用查詢說明。固定回傳 TTM。

export const getReceivablesTurnoverProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const resolution = await resolveTurnoverRatioProvenanceInputs(query);
  if (!resolution) {
    return { symbol: query.symbol, metricCode: 'receivablesTurnover', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { symbol, fiscalYear, fiscalQuarter, accountsReceivable, ttmQuarters, ttmOperatingRevenues, ttmComplete, revenueTtmSum } = resolution;
  const result = ttmComplete ? calculateReceivablesTurnover(revenueTtmSum, accountsReceivable) : { value: null, nullReason: 'insufficient_history' as const };

  const entries: ProvenanceEntry[] = [
    ...ttmQuarters.map(
      (tq, i): ProvenanceEntry => ({
        role: `TTM 營收（第 ${i + 1}/4 季）`,
        fiscalYear: rocYearToGregorian(Number(tq.year)),
        fiscalQuarter: Number(tq.season),
        type: 'statementField',
        statementType: 'incomeStatement',
        fieldKey: 'revenue',
        sourceDescription: null,
        value: toProvenanceEntryValue(ttmOperatingRevenues[i]),
      })
    ),
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

  return { symbol, metricCode: 'receivablesTurnover', found: true, fiscalYear, fiscalQuarter, value: result.value, entries, methodologyNote: null };
};
