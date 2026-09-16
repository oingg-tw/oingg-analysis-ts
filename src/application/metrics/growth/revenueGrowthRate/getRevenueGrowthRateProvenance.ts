import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { calculateYoyGrowthRateBigint } from '@/domain/metrics/shared/numericHelpers';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-13 使用者要求擴大稽核鏈——revenueGrowthRate（單季年增率）= (本季營收 - 去年同季
// 營收) / |去年同季營收| * 100。跟 computeRevenueGrowthRatePit.ts 一致。只有 Q 一種 basis。

export const getRevenueGrowthRateProvenance = async (query: QuarterlyMetricQuery, deps: Pick<PitDeps, 'statements' | 'quarters'>): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'revenueGrowthRate', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const incomeStatement = await deps.statements.getIncomeStatement({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const currentRevenue = incomeStatement?.operatingRevenue ?? null;

  const prior = getPastNQuarters({ rocYear, season: season as Season }, 5)[0]!;
  const priorRocYear = Number(prior.year);
  const priorSeason = Number(prior.season);
  const priorIncomeStatement = await deps.statements.getIncomeStatement({ symbol, year: priorRocYear, quarter: priorSeason, dataType, subsidiaryCompanyId });
  const priorRevenue = priorIncomeStatement?.operatingRevenue ?? null;

  const { value } = calculateYoyGrowthRateBigint(currentRevenue, priorRevenue);

  const entries: ProvenanceEntry[] = [
    { role: '本季營收', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'incomeStatement', fieldKey: 'revenue', sourceDescription: null, value: toProvenanceEntryValue(currentRevenue) },
    { role: '去年同季營收', fiscalYear: rocYearToGregorian(priorRocYear), fiscalQuarter: priorSeason, type: 'statementField', statementType: 'incomeStatement', fieldKey: 'revenue', sourceDescription: null, value: toProvenanceEntryValue(priorRevenue) },
  ];

  return { symbol, metricCode: 'revenueGrowthRate', found: true, fiscalYear, fiscalQuarter: seasonNum, value, entries, methodologyNote: null };
};
