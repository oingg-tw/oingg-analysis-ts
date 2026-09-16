import { resolveQuarterOrLatest } from '@/models/latestQuarter';
import { calculateYoyGrowthRateBigint } from '@/domainPitMetrics/shared/numericHelpers';
import { pickEquityWithFieldKey as pickEquity } from '@/domainPitMetrics/shared/pickers';
import { getBalanceSheetXbrlFirst as getQuarterlyBalanceSheet } from '@/models/mops/balanceSheetXbrlFirst';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-13 使用者要求擴大稽核鏈——equityGrowthRate（單季年增率）= (本季期末淨值 - 去年
// 同季期末淨值) / |去年同季期末淨值| * 100。淨值優先採歸屬母公司口徑，缺漏退回整體口徑。
// 跟 computeEquityGrowthRatePit.ts 一致。只有 Q 一種 basis。

export const getEquityGrowthRateProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet']);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'equityGrowthRate', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const balanceSheet = await getQuarterlyBalanceSheet({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const currentEquity = pickEquity(balanceSheet);

  const prior = getPastNQuarters({ rocYear, season: season as Season }, 5)[0]!;
  const priorRocYear = Number(prior.year);
  const priorSeason = Number(prior.season);
  const priorBalanceSheet = await getQuarterlyBalanceSheet({ symbol, year: priorRocYear, quarter: priorSeason, dataType, subsidiaryCompanyId });
  const priorEquity = pickEquity(priorBalanceSheet);

  const { value } = calculateYoyGrowthRateBigint(currentEquity.value, priorEquity.value);

  const entries: ProvenanceEntry[] = [
    { role: '本季期末淨值', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: currentEquity.fieldKey, sourceDescription: null, value: toProvenanceEntryValue(currentEquity.value) },
    { role: '去年同季期末淨值', fiscalYear: rocYearToGregorian(priorRocYear), fiscalQuarter: priorSeason, type: 'statementField', statementType: 'balanceSheet', fieldKey: priorEquity.fieldKey, sourceDescription: null, value: toProvenanceEntryValue(priorEquity.value) },
  ];

  return { symbol, metricCode: 'equityGrowthRate', found: true, fiscalYear, fiscalQuarter: seasonNum, value, entries, methodologyNote: null };
};
