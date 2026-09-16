import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { calculateReceivablesTurnover } from '../receivablesTurnover/calculateReceivablesTurnover';
import { calculateReceivablesDays } from './calculateReceivablesDays';
import { resolveTurnoverRatioProvenanceInputs } from '../turnoverRatio/resolveTurnoverRatioProvenanceInputs';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-13 使用者要求擴大稽核鏈——receivablesDays(DSO) = 365 / 應收帳款周轉率(TTM)，
// 是 receivablesTurnover 的衍生轉換，見 getInventoryDaysProvenance.ts 同一個模式的說明。

export const getReceivablesDaysProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const resolution = await resolveTurnoverRatioProvenanceInputs(query);
  if (!resolution) {
    return { symbol: query.symbol, metricCode: 'receivablesDays', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { symbol, fiscalYear, fiscalQuarter, accountsReceivable, ttmQuarters, ttmOperatingRevenues, ttmComplete, revenueTtmSum } = resolution;
  const turnover = ttmComplete ? calculateReceivablesTurnover(revenueTtmSum, accountsReceivable) : { value: null, nullReason: 'insufficient_history' as const };
  const result = calculateReceivablesDays(turnover.value, turnover.nullReason);

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

  return {
    symbol,
    metricCode: 'receivablesDays',
    found: true,
    fiscalYear,
    fiscalQuarter,
    value: result.value,
    entries,
    methodologyNote: `DSO = 365 ÷ 應收帳款周轉率(TTM)，周轉率本身 = TTM 營收 ÷ 本季期末應收帳款（見上方原始欄位），這裡不是查回一組獨立的原始欄位。周轉率(TTM)＝${turnover.value ?? 'null'}。`,
  };
};
