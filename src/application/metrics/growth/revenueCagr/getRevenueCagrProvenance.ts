import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import { resolveTrailingIncomeStatements, trailingPeriodLabel, type ReportingBasis } from '../../shared/trailingYear';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry, type ProvenanceMetricCode } from '../../shared/provenance/provenanceTypes';
import { REVENUE_CAGR_YEARS } from '../../../../domain/metrics/growth/revenueCagr/revenueCagrDefinition';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-13 使用者要求擴大稽核鏈——revenueCagr{3,5,8}y = (最近一個完整會計年度營收 /
// N 年前完整會計年度營收)^(1/N) - 1，年營收各自是 4 季 operatingRevenue 加總。跟
// computeRevenueCagrFamilyPit.ts 一致。這是 3 個獨立 metricCode（revenueCagr3y/5y/8y），
// 這支檔案接受 years 參數，PROVENANCE_RESOLVERS 各自綁一個 years 值呼叫。fiscalQuarter
// 固定回傳 4（FY basis，年度資料無季別概念）。

interface AnnualRevenueResult {
  value: bigint | null;
  basis: ReportingBasis;
  quarters: { year: string; season: Season; fiscalYear: number; fiscalQuarter: number; value: bigint | null }[];
}

const getAnnualRevenue = async (
  cache: Map<number, AnnualRevenueResult>,
  symbol: string,
  rocYear: number,
  dataType: string,
  subsidiaryCompanyId: string, deps: RevenueCagrProvenanceDeps
): Promise<AnnualRevenueResult> => {
  if (cache.has(rocYear)) return cache.get(rocYear)!;

  // 2026-10-01 年度加總跟 computeRevenueCagrFamily 同一個共用近一年來源（興櫃半年頻：上下半年，見 shared/trailingYear.ts）。
  const trailing = await resolveTrailingIncomeStatements({ symbol, rocYear, season: '4', dataType, subsidiaryCompanyId }, deps);
  const records = trailing.periods.map((p) => p.record);
  const quarters = trailing.periods.map((p) => ({ year: p.year, season: p.season, fiscalYear: rocYearToGregorian(Number(p.year)), fiscalQuarter: Number(p.season), value: p.record?.operatingRevenue ?? null }));
  const value = records.some((r) => r === null || r.operatingRevenue === null) ? null : records.reduce((sum, r) => sum + r!.operatingRevenue!, 0n);
  const result: AnnualRevenueResult = { value, basis: trailing.basis, quarters };
  cache.set(rocYear, result);
  return result;
};

type RevenueCagrProvenanceDeps = Pick<PitDeps, 'statements' | 'quarters' | 'cumulativeStatements'>;

export const getRevenueCagrProvenanceForYears = (years: (typeof REVENUE_CAGR_YEARS)[number], deps: RevenueCagrProvenanceDeps) => {
  const metricCode = `revenueCagr${years}y` as ProvenanceMetricCode;

  return async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
    const { symbol, dataType, subsidiaryCompanyId } = query;

    const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement'], deps.quarters);

    if (!resolvedQuarter) {
      return { symbol, metricCode, found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
    }

    const { year, season } = resolvedQuarter;
    const rocYear = Number(year);
    const seasonNum = Number(season);
    const fiscalYear = rocYearToGregorian(rocYear);

    const latestCompleteFiscalYear = seasonNum === 4 ? rocYear : rocYear - 1;
    const cache = new Map<number, AnnualRevenueResult>();
    const current = await getAnnualRevenue(cache, symbol, latestCompleteFiscalYear, dataType, subsidiaryCompanyId, deps);
    const prior = await getAnnualRevenue(cache, symbol, latestCompleteFiscalYear - years, dataType, subsidiaryCompanyId, deps);

    const value =
      current.value !== null && prior.value !== null && prior.value > 0n
        ? Math.round((Math.pow(Number(current.value) / Number(prior.value), 1 / years) - 1) * 100 * 100) / 100
        : null;

    const buildQuarterEntries = (label: string, annual: AnnualRevenueResult): ProvenanceEntry[] =>
      annual.quarters.map((q) => ({
        role: `${label}${trailingPeriodLabel(q, annual.basis)}營收`,
        fiscalYear: q.fiscalYear,
        fiscalQuarter: q.fiscalQuarter,
        type: 'statementField',
        statementType: 'incomeStatement',
        fieldKey: 'revenue',
        sourceDescription: null,
        value: toProvenanceEntryValue(q.value),
      }));

    const entries: ProvenanceEntry[] = [
      ...buildQuarterEntries(`最近完整會計年度（民國 ${latestCompleteFiscalYear} 年）`, current),
      ...buildQuarterEntries(`${years} 年前完整會計年度（民國 ${latestCompleteFiscalYear - years} 年）`, prior),
    ];

    return {
      symbol,
      metricCode,
      found: true,
      fiscalYear,
      fiscalQuarter: seasonNum,
      value,
      entries,
      methodologyNote: `年營收 = 該年度 4 季營收加總，不是財報原始欄位。最近完整會計年度（民國 ${latestCompleteFiscalYear} 年）營收＝${current.value ?? 'null'}，${years} 年前（民國 ${latestCompleteFiscalYear - years} 年）營收＝${prior.value ?? 'null'}。CAGR = (最近/N年前)^(1/${years})-1。`,
    };
  };
};
