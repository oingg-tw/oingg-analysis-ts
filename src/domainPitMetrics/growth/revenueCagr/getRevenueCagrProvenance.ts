import { resolveQuarterOrLatest } from '@/shared/sourceData/latestQuarter';
import { getIncomeStatementXbrlFirst as getQuarterlyIncomeStatement } from '@/shared/sourceData/incomeStatementXbrlFirst';
import { rocYearToGregorian } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry, type ProvenanceMetricCode } from '../../shared/provenance/provenanceTypes';
import { REVENUE_CAGR_YEARS } from './revenueCagrDefinition';

// 2026-09-13 使用者要求擴大稽核鏈——revenueCagr{3,5,8}y = (最近一個完整會計年度營收 /
// N 年前完整會計年度營收)^(1/N) - 1，年營收各自是 4 季 operatingRevenue 加總。跟
// computeRevenueCagrFamilyPit.ts 一致。這是 3 個獨立 metricCode（revenueCagr3y/5y/8y），
// 這支檔案接受 years 參數，PROVENANCE_RESOLVERS 各自綁一個 years 值呼叫。fiscalQuarter
// 固定回傳 4（FY basis，年度資料無季別概念）。

const getAnnualRevenue = async (
  cache: Map<number, { value: bigint | null; quarters: { fiscalYear: number; fiscalQuarter: number; value: bigint | null }[] }>,
  symbol: string,
  rocYear: number,
  dataType: string,
  subsidiaryCompanyId: string
) => {
  if (cache.has(rocYear)) return cache.get(rocYear)!;

  const records = await Promise.all(
    [1, 2, 3, 4].map((quarter) => getQuarterlyIncomeStatement({ symbol, year: rocYear, quarter, dataType, subsidiaryCompanyId }))
  );
  const quarters = records.map((r, i) => ({ fiscalYear: rocYearToGregorian(rocYear), fiscalQuarter: i + 1, value: r?.operatingRevenue ?? null }));
  const value = records.some((r) => r === null || r.operatingRevenue === null) ? null : records.reduce((sum, r) => sum + r!.operatingRevenue!, 0n);
  const result = { value, quarters };
  cache.set(rocYear, result);
  return result;
};

export const getRevenueCagrProvenanceForYears = (years: (typeof REVENUE_CAGR_YEARS)[number]) => {
  const metricCode = `revenueCagr${years}y` as ProvenanceMetricCode;

  return async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
    const { symbol, dataType, subsidiaryCompanyId } = query;

    const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement']);

    if (!resolvedQuarter) {
      return { symbol, metricCode, found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
    }

    const { year, season } = resolvedQuarter;
    const rocYear = Number(year);
    const seasonNum = Number(season);
    const fiscalYear = rocYearToGregorian(rocYear);

    const latestCompleteFiscalYear = seasonNum === 4 ? rocYear : rocYear - 1;
    const cache = new Map<number, { value: bigint | null; quarters: { fiscalYear: number; fiscalQuarter: number; value: bigint | null }[] }>();
    const current = await getAnnualRevenue(cache, symbol, latestCompleteFiscalYear, dataType, subsidiaryCompanyId);
    const prior = await getAnnualRevenue(cache, symbol, latestCompleteFiscalYear - years, dataType, subsidiaryCompanyId);

    const value =
      current.value !== null && prior.value !== null && prior.value > 0n
        ? Math.round((Math.pow(Number(current.value) / Number(prior.value), 1 / years) - 1) * 100 * 100) / 100
        : null;

    const buildQuarterEntries = (label: string, quarters: { fiscalYear: number; fiscalQuarter: number; value: bigint | null }[]): ProvenanceEntry[] =>
      quarters.map((q) => ({
        role: `${label}第 ${q.fiscalQuarter} 季營收`,
        fiscalYear: q.fiscalYear,
        fiscalQuarter: q.fiscalQuarter,
        type: 'statementField',
        statementType: 'incomeStatement',
        fieldKey: 'revenue',
        sourceDescription: null,
        value: toProvenanceEntryValue(q.value),
      }));

    const entries: ProvenanceEntry[] = [
      ...buildQuarterEntries(`最近完整會計年度（民國 ${latestCompleteFiscalYear} 年）`, current.quarters),
      ...buildQuarterEntries(`${years} 年前完整會計年度（民國 ${latestCompleteFiscalYear - years} 年）`, prior.quarters),
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
