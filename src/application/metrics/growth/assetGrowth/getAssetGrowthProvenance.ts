import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { calculateYoyGrowthRateBigint } from '@/domain/metrics/shared/numericHelpers';
import { getBalanceSheetXbrlFirst as getQuarterlyBalanceSheet } from '@/infrastructure/repositories/mops/balanceSheetXbrlFirst';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-13 使用者要求擴大稽核鏈——assetGrowth（單季年增率）= (本季總資產 - 去年同季總
// 資產) / |去年同季總資產| * 100。跟 computeAssetGrowthPit.ts 一致，去年同季用
// getPastNQuarters({rocYear,season},5)[0] 取得。只有 Q 一種 basis。

export const getAssetGrowthProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet']);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'assetGrowth', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const balanceSheet = await getQuarterlyBalanceSheet({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const currentAssets = balanceSheet?.totalAssets ?? null;

  const prior = getPastNQuarters({ rocYear, season: season as Season }, 5)[0]!;
  const priorRocYear = Number(prior.year);
  const priorSeason = Number(prior.season);
  const priorBalanceSheet = await getQuarterlyBalanceSheet({ symbol, year: priorRocYear, quarter: priorSeason, dataType, subsidiaryCompanyId });
  const priorAssets = priorBalanceSheet?.totalAssets ?? null;

  const { value } = calculateYoyGrowthRateBigint(currentAssets, priorAssets);

  const entries: ProvenanceEntry[] = [
    { role: '本季期末總資產', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'assets', sourceDescription: null, value: toProvenanceEntryValue(currentAssets) },
    { role: '去年同季期末總資產', fiscalYear: rocYearToGregorian(priorRocYear), fiscalQuarter: priorSeason, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'assets', sourceDescription: null, value: toProvenanceEntryValue(priorAssets) },
  ];

  return { symbol, metricCode: 'assetGrowth', found: true, fiscalYear, fiscalQuarter: seasonNum, value, entries, methodologyNote: null };
};
