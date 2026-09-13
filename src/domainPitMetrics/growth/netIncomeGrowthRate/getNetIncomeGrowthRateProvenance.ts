import { resolveQuarterOrLatest } from '@/shared/sourceData/latestQuarter';
import { calculateYoyGrowthRateBigint } from '@/domainPitMetrics/shared/numericHelpers';
import { pickNetIncomeWithFieldKey as pickNetIncome } from '@/domainPitMetrics/shared/pickers';
import { getIncomeStatementXbrlFirst as getQuarterlyIncomeStatement } from '@/shared/sourceData/incomeStatementXbrlFirst';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-13 使用者要求擴大稽核鏈——netIncomeGrowthRate（單季年增率）= (本季淨利 - 去年
// 同季淨利) / |去年同季淨利| * 100。淨利優先採歸屬母公司口徑，缺漏退回整體口徑。跟
// computeNetIncomeGrowthRatePit.ts 一致。只有 Q 一種 basis。

export const getNetIncomeGrowthRateProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement']);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'netIncomeGrowthRate', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const incomeStatement = await getQuarterlyIncomeStatement({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const currentNetIncome = pickNetIncome(incomeStatement);

  const prior = getPastNQuarters({ rocYear, season: season as Season }, 5)[0]!;
  const priorRocYear = Number(prior.year);
  const priorSeason = Number(prior.season);
  const priorIncomeStatement = await getQuarterlyIncomeStatement({ symbol, year: priorRocYear, quarter: priorSeason, dataType, subsidiaryCompanyId });
  const priorNetIncome = pickNetIncome(priorIncomeStatement);

  const { value } = calculateYoyGrowthRateBigint(currentNetIncome.value, priorNetIncome.value);

  const entries: ProvenanceEntry[] = [
    { role: '本季淨利', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'incomeStatement', fieldKey: currentNetIncome.fieldKey, sourceDescription: null, value: toProvenanceEntryValue(currentNetIncome.value) },
    { role: '去年同季淨利', fiscalYear: rocYearToGregorian(priorRocYear), fiscalQuarter: priorSeason, type: 'statementField', statementType: 'incomeStatement', fieldKey: priorNetIncome.fieldKey, sourceDescription: null, value: toProvenanceEntryValue(priorNetIncome.value) },
  ];

  return { symbol, metricCode: 'netIncomeGrowthRate', found: true, fiscalYear, fiscalQuarter: seasonNum, value, entries, methodologyNote: null };
};
