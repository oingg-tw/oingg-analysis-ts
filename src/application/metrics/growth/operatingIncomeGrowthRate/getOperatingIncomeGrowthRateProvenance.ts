import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { calculateYoyGrowthRateBigint } from '@/domain/metrics/shared/numericHelpers';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-13 使用者要求擴大稽核鏈——operatingIncomeGrowthRate（單季年增率）= (本季營業
// 利益 - 去年同季營業利益) / |去年同季營業利益| * 100。跟
// computeOperatingIncomeGrowthRatePit.ts 一致。只有 Q 一種 basis。

export const getOperatingIncomeGrowthRateProvenance = async (query: QuarterlyMetricQuery, deps: Pick<PitDeps, 'statements' | 'quarters'>): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'operatingIncomeGrowthRate', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const incomeStatement = await deps.statements.getIncomeStatement({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const currentOperatingIncome = incomeStatement?.operatingIncome ?? null;

  const prior = getPastNQuarters({ rocYear, season: season as Season }, 5)[0]!;
  const priorRocYear = Number(prior.year);
  const priorSeason = Number(prior.season);
  const priorIncomeStatement = await deps.statements.getIncomeStatement({ symbol, year: priorRocYear, quarter: priorSeason, dataType, subsidiaryCompanyId });
  const priorOperatingIncome = priorIncomeStatement?.operatingIncome ?? null;

  const { value } = calculateYoyGrowthRateBigint(currentOperatingIncome, priorOperatingIncome);

  const entries: ProvenanceEntry[] = [
    { role: '本季營業利益', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'incomeStatement', fieldKey: 'profit_loss_from_operating_activities', sourceDescription: null, value: toProvenanceEntryValue(currentOperatingIncome) },
    { role: '去年同季營業利益', fiscalYear: rocYearToGregorian(priorRocYear), fiscalQuarter: priorSeason, type: 'statementField', statementType: 'incomeStatement', fieldKey: 'profit_loss_from_operating_activities', sourceDescription: null, value: toProvenanceEntryValue(priorOperatingIncome) },
  ];

  return { symbol, metricCode: 'operatingIncomeGrowthRate', found: true, fiscalYear, fiscalQuarter: seasonNum, value, entries, methodologyNote: null };
};
