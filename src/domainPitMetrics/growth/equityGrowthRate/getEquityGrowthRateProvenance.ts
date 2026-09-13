import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getBalanceSheetXbrlFirst as getQuarterlyBalanceSheet } from '@/shared/sourceData/balanceSheetXbrlFirst';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-13 使用者要求擴大稽核鏈——equityGrowthRate（單季年增率）= (本季期末淨值 - 去年
// 同季期末淨值) / |去年同季期末淨值| * 100。淨值優先採歸屬母公司口徑，缺漏退回整體口徑。
// 跟 computeEquityGrowthRatePit.ts 一致。只有 Q 一種 basis。

interface PickedField {
  value: bigint | null;
  fieldKey: string | null;
}

const pickEquity = (record: { equityAttributableToParent: bigint | null; totalEquity: bigint | null } | null): PickedField => {
  if (!record) return { value: null, fieldKey: null };
  if (record.equityAttributableToParent !== null) return { value: record.equityAttributableToParent, fieldKey: 'equity_attributable_to_owners_of_parent' };
  if (record.totalEquity !== null) return { value: record.totalEquity, fieldKey: 'equity' };
  return { value: null, fieldKey: null };
};

export const getEquityGrowthRateProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['balanceSheet']);

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

  const value =
    currentEquity.value !== null && priorEquity.value !== null && priorEquity.value !== 0n
      ? Math.round((Number(currentEquity.value - priorEquity.value) / Math.abs(Number(priorEquity.value))) * 100 * 100) / 100
      : null;

  const entries: ProvenanceEntry[] = [
    { role: '本季期末淨值', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: currentEquity.fieldKey, sourceDescription: null, value: toProvenanceEntryValue(currentEquity.value) },
    { role: '去年同季期末淨值', fiscalYear: rocYearToGregorian(priorRocYear), fiscalQuarter: priorSeason, type: 'statementField', statementType: 'balanceSheet', fieldKey: priorEquity.fieldKey, sourceDescription: null, value: toProvenanceEntryValue(priorEquity.value) },
  ];

  return { symbol, metricCode: 'equityGrowthRate', found: true, fiscalYear, fiscalQuarter: seasonNum, value, entries, methodologyNote: null };
};
