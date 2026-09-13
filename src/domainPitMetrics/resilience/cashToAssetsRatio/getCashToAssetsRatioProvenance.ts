import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getBalanceSheetXbrlFirst as getQuarterlyBalanceSheet } from '@/shared/sourceData/balanceSheetXbrlFirst';
import { rocYearToGregorian } from '@/shared/rocQuarter';
import { toPercent } from '@/domainPitMetrics/shared/numericHelpers';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-13 使用者要求擴大稽核鏈——cashToAssetsRatio(現金及約當現金占總資產比) =
// 現金及約當現金 / 總資產 × 100。純資產負債表時點快照，只有 Q 一種 basis。

export const getCashToAssetsRatioProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['balanceSheet']);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'cashToAssetsRatio', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const balanceSheet = await getQuarterlyBalanceSheet({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const cashAndEquivalents = balanceSheet?.cashAndEquivalents ?? null;
  const totalAssets = balanceSheet?.totalAssets ?? null;
  const value = cashAndEquivalents !== null && totalAssets !== null ? toPercent(cashAndEquivalents, totalAssets) : null;

  const entries: ProvenanceEntry[] = [
    {
      role: '本季期末現金及約當現金',
      fiscalYear,
      fiscalQuarter: seasonNum,
      type: 'statementField',
      statementType: 'balanceSheet',
      fieldKey: 'cash_and_cash_equivalents',
      sourceDescription: null,
      value: toProvenanceEntryValue(cashAndEquivalents),
    },
    { role: '本季期末總資產', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'assets', sourceDescription: null, value: toProvenanceEntryValue(totalAssets) },
  ];

  return { symbol, metricCode: 'cashToAssetsRatio', found: true, fiscalYear, fiscalQuarter: seasonNum, value, entries, methodologyNote: null };
};
