import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { getBalanceSheetXbrlFirst as getQuarterlyBalanceSheet } from '@/infrastructure/repositories/mops/balanceSheetXbrlFirst';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import { toPercent } from '@/domain/metrics/shared/numericHelpers';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-13 使用者要求擴大稽核鏈——netWorkingCapitalToAssets = (流動資產−流動負債) /
// 總資產 × 100，分子淨營運資金是中繼值，稽核鏈分開列出三筆原始欄位。純資產負債表時點
// 快照，只有 Q 一種 basis。

export const getNetWorkingCapitalToAssetsProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet']);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'netWorkingCapitalToAssets', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const balanceSheet = await getQuarterlyBalanceSheet({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const currentAssets = balanceSheet?.currentAssets ?? null;
  const currentLiabilities = balanceSheet?.currentLiabilities ?? null;
  const totalAssets = balanceSheet?.totalAssets ?? null;
  const netWorkingCapital = currentAssets !== null && currentLiabilities !== null ? currentAssets - currentLiabilities : null;
  const value = netWorkingCapital !== null && totalAssets !== null ? toPercent(netWorkingCapital, totalAssets) : null;

  const entries: ProvenanceEntry[] = [
    { role: '本季期末流動資產', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'current_assets', sourceDescription: null, value: toProvenanceEntryValue(currentAssets) },
    {
      role: '本季期末流動負債',
      fiscalYear,
      fiscalQuarter: seasonNum,
      type: 'statementField',
      statementType: 'balanceSheet',
      fieldKey: 'current_liabilities',
      sourceDescription: null,
      value: toProvenanceEntryValue(currentLiabilities),
    },
    { role: '本季期末總資產', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'assets', sourceDescription: null, value: toProvenanceEntryValue(totalAssets) },
  ];

  return {
    symbol,
    metricCode: 'netWorkingCapitalToAssets',
    found: true,
    fiscalYear,
    fiscalQuarter: seasonNum,
    value,
    entries,
    methodologyNote: `分子淨營運資金 = 流動資產 − 流動負債（見上方兩筆原始欄位相減），本身不是財報原始欄位。淨營運資金＝${netWorkingCapital ?? 'null'}。`,
  };
};
