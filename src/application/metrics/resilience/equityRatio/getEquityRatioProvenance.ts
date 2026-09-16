import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { getBalanceSheetXbrlFirst as getQuarterlyBalanceSheet } from '@/infrastructure/repositories/mops/balanceSheetXbrlFirst';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import { toPercent } from '@/domain/metrics/shared/numericHelpers';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-13 使用者要求擴大稽核鏈——equityRatio(股東權益比率) = 權益(整體口徑) / 總資產 × 100。
// 跟 deRatio 不同：這支固定用整體權益（totalEquity），不是「歸屬母公司優先」的 pick 邏輯
// （見 computeEquityRatioPit.ts）。純資產負債表時點快照，只有 Q 一種 basis。

export const getEquityRatioProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet']);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'equityRatio', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const balanceSheet = await getQuarterlyBalanceSheet({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const totalEquity = balanceSheet?.totalEquity ?? null;
  const totalAssets = balanceSheet?.totalAssets ?? null;
  const value = totalEquity !== null && totalAssets !== null ? toPercent(totalEquity, totalAssets) : null;

  const entries: ProvenanceEntry[] = [
    { role: '本季期末權益（整體口徑）', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'equity', sourceDescription: null, value: toProvenanceEntryValue(totalEquity) },
    { role: '本季期末總資產', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'assets', sourceDescription: null, value: toProvenanceEntryValue(totalAssets) },
  ];

  return { symbol, metricCode: 'equityRatio', found: true, fiscalYear, fiscalQuarter: seasonNum, value, entries, methodologyNote: null };
};
