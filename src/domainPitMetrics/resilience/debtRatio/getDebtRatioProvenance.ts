import { resolveQuarterOrLatest } from '@/models/latestQuarter';
import { getBalanceSheetXbrlFirst as getQuarterlyBalanceSheet } from '@/models/balanceSheetXbrlFirst';
import { rocYearToGregorian } from '@/shared/rocQuarter';
import { toPercent } from '@/domainPitMetrics/shared/numericHelpers';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-13 使用者要求擴大稽核鏈——debtRatio(負債比率) = 總負債 / 總資產 × 100，純資產
// 負債表時點快照，只有 Q 一種 basis。現查現算不持久化，刻意不動 computeDebtRatioPit.ts。

export const getDebtRatioProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet']);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'debtRatio', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const balanceSheet = await getQuarterlyBalanceSheet({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const totalLiabilities = balanceSheet?.totalLiabilities ?? null;
  const totalAssets = balanceSheet?.totalAssets ?? null;
  const value = totalLiabilities !== null && totalAssets !== null ? toPercent(totalLiabilities, totalAssets) : null;

  const entries: ProvenanceEntry[] = [
    { role: '本季期末總負債', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'liabilities', sourceDescription: null, value: toProvenanceEntryValue(totalLiabilities) },
    { role: '本季期末總資產', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'assets', sourceDescription: null, value: toProvenanceEntryValue(totalAssets) },
  ];

  return { symbol, metricCode: 'debtRatio', found: true, fiscalYear, fiscalQuarter: seasonNum, value, entries, methodologyNote: null };
};
