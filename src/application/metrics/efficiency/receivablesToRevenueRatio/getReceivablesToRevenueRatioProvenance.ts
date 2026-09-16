import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import { toPercent } from '@/domain/metrics/shared/numericHelpers';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveTurnoverRatioProvenanceInputs } from '../turnoverRatio/resolveTurnoverRatioProvenanceInputs';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-13 使用者要求擴大稽核鏈——receivablesToRevenueRatio = 本季期末應收帳款 / 營收(TTM)
// × 100，跟 computeTurnoverRatioFamilyPit.ts 用同一支 toPercent（見 numericHelpers.ts）。

export const getReceivablesToRevenueRatioProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const resolution = await resolveTurnoverRatioProvenanceInputs(query);
  if (!resolution) {
    return { symbol: query.symbol, metricCode: 'receivablesToRevenueRatio', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { symbol, fiscalYear, fiscalQuarter, accountsReceivable, ttmQuarters, ttmOperatingRevenues, ttmComplete, revenueTtmSum } = resolution;
  const value = ttmComplete && accountsReceivable !== null ? toPercent(accountsReceivable, revenueTtmSum) : null;

  const entries: ProvenanceEntry[] = [
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
  ];

  return { symbol, metricCode: 'receivablesToRevenueRatio', found: true, fiscalYear, fiscalQuarter, value, entries, methodologyNote: null };
};
