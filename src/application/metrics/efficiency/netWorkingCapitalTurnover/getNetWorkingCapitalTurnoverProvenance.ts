import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import { toRatio } from '@/domain/metrics/shared/numericHelpers';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveTurnoverRatioProvenanceInputs } from '../turnoverRatio/resolveTurnoverRatioProvenanceInputs';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-13 使用者要求擴大稽核鏈——netWorkingCapitalTurnover = 營收(TTM) / 淨營運資金，
// 淨營運資金 = 流動資產 − 流動負債（本身不是財報原始欄位，是相減得出的中繼值，稽核鏈
// 分開列出流動資產/流動負債兩筆原始欄位，不是只列相減後的淨值）。跟
// computeTurnoverRatioFamilyPit.ts 用同一支 toRatio（見 numericHelpers.ts）。

export const getNetWorkingCapitalTurnoverProvenance = async (query: QuarterlyMetricQuery, deps: PitDeps): Promise<MetricProvenanceResult> => {
  const resolution = await resolveTurnoverRatioProvenanceInputs(query, deps);
  if (!resolution) {
    return { symbol: query.symbol, metricCode: 'netWorkingCapitalTurnover', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { symbol, fiscalYear, fiscalQuarter, currentAssets, currentLiabilities, ttmQuarters, ttmOperatingRevenues, ttmComplete, revenueTtmSum } = resolution;
  const netWorkingCapital = currentAssets !== null && currentLiabilities !== null ? currentAssets - currentLiabilities : null;
  const value = ttmComplete && netWorkingCapital !== null ? toRatio(revenueTtmSum, netWorkingCapital) : null;

  const entries: ProvenanceEntry[] = [
    ...ttmQuarters.map(
      (tq, i): ProvenanceEntry => ({
        role: `近四季 營收（第 ${i + 1}/4 季）`,
        fiscalYear: rocYearToGregorian(Number(tq.year)),
        fiscalQuarter: Number(tq.season),
        type: 'statementField',
        statementType: 'incomeStatement',
        fieldKey: 'revenue',
        sourceDescription: null,
        value: toProvenanceEntryValue(ttmOperatingRevenues[i]),
      })
    ),
    { role: '本季期末流動資產', fiscalYear, fiscalQuarter, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'current_assets', sourceDescription: null, value: toProvenanceEntryValue(currentAssets) },
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

  return {
    symbol,
    metricCode: 'netWorkingCapitalTurnover',
    found: true,
    fiscalYear,
    fiscalQuarter,
    value,
    entries,
    methodologyNote: `分母淨營運資金 = 流動資產 − 流動負債（見上方兩筆原始欄位相減），本身不是財報原始欄位。淨營運資金＝${netWorkingCapital ?? 'null'}。`,
  };
};
