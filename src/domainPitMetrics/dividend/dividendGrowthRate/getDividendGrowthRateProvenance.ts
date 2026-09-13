import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getCashFlowStatementXbrlFirst as getQuarterlyCashFlowStatement } from '@/shared/sourceData/cashFlowStatementXbrlFirst';
import { getPaidInSharesAsOf } from '@/shared/sourceData/capitalStock';
import { rocYearToGregorian } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry, type ProvenanceMetricCode } from '../../shared/provenance/provenanceTypes';
import { DIVIDEND_GROWTH_RATE_YEARS } from './dividendGrowthRateDefinition';

// 2026-09-13 使用者要求擴大稽核鏈——dividendGrowthRate{3,5,8}y = (最近一個完整會計年度
// 近似每股股利 / N 年前完整會計年度近似每股股利)^(1/N) - 1。年度近似每股股利 = 4 季
// dividendsPaid 加總取絕對值×1000(千元換元) / 當年 Q4 報告日流通股數（現金流量近似版，
// 不是官方公告的每股股利數字，見 dividendGrowthRateDefinition.ts 的 variant_of 說明）。
// 跟 computeDividendGrowthRateFamilyPit.ts 一致。這是 3 個獨立 metricCode
// （dividendGrowthRate3y/5y/8y），這支檔案接受 years 參數，PROVENANCE_RESOLVERS 各自綁
// 一個 years 值呼叫。

interface AnnualDpsQuarterDetail {
  fiscalYear: number;
  fiscalQuarter: number;
  dividendsPaid: bigint | null;
}

interface AnnualDpsResult {
  dps: number | null;
  quarters: AnnualDpsQuarterDetail[];
  shares: bigint | null;
}

const getAnnualDividendPerShareProxy = async (
  cache: Map<number, AnnualDpsResult>,
  symbol: string,
  rocYear: number,
  dataType: string,
  subsidiaryCompanyId: string
): Promise<AnnualDpsResult> => {
  if (cache.has(rocYear)) return cache.get(rocYear)!;

  const records = await Promise.all(
    [1, 2, 3, 4].map((quarter) => getQuarterlyCashFlowStatement({ symbol, year: rocYear, quarter, dataType, subsidiaryCompanyId }))
  );
  const quarters: AnnualDpsQuarterDetail[] = records.map((r, i) => ({ fiscalYear: rocYearToGregorian(rocYear), fiscalQuarter: i + 1, dividendsPaid: r?.dividendsPaid ?? null }));

  if (records.some((r) => r === null || r.dividendsPaid === null)) {
    const result: AnnualDpsResult = { dps: null, quarters, shares: null };
    cache.set(rocYear, result);
    return result;
  }

  const yearSum = records.reduce((sum, r) => sum + r!.dividendsPaid!, 0n);
  const dividendsPaidAbs = yearSum < 0n ? -yearSum : yearSum;
  const q4ReportDate = records[3]!.reportDate;
  const shares = (await getPaidInSharesAsOf(symbol, q4ReportDate))?.paidInShares ?? null;

  const dps = shares !== null && shares !== 0n ? (Number(dividendsPaidAbs) * 1000) / Number(shares) : null;
  const result: AnnualDpsResult = { dps, quarters, shares };
  cache.set(rocYear, result);
  return result;
};

export const getDividendGrowthRateProvenanceForYears = (years: (typeof DIVIDEND_GROWTH_RATE_YEARS)[number]) => {
  const metricCode = `dividendGrowthRate${years}y` as ProvenanceMetricCode;

  return async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
    const { symbol, dataType, subsidiaryCompanyId } = query;

    const resolvedQuarter =
      query.year !== undefined && query.season !== undefined
        ? { year: query.year, season: query.season }
        : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['cashFlowStatement']);

    if (!resolvedQuarter) {
      return { symbol, metricCode, found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
    }

    const { year, season } = resolvedQuarter;
    const rocYear = Number(year);
    const seasonNum = Number(season);
    const fiscalYear = rocYearToGregorian(rocYear);

    const latestCompleteFiscalYear = seasonNum === 4 ? rocYear : rocYear - 1;
    const cache = new Map<number, AnnualDpsResult>();
    const current = await getAnnualDividendPerShareProxy(cache, symbol, latestCompleteFiscalYear, dataType, subsidiaryCompanyId);
    const prior = await getAnnualDividendPerShareProxy(cache, symbol, latestCompleteFiscalYear - years, dataType, subsidiaryCompanyId);

    const value =
      current.dps !== null && prior.dps !== null && prior.dps > 0
        ? Math.round((Math.pow(current.dps / prior.dps, 1 / years) - 1) * 100 * 100) / 100
        : null;

    const buildYearEntries = (label: string, annual: AnnualDpsResult): ProvenanceEntry[] => [
      ...annual.quarters.map(
        (q): ProvenanceEntry => ({
          role: `${label}第 ${q.fiscalQuarter} 季發放股利（原始資料是現金流出負值）`,
          fiscalYear: q.fiscalYear,
          fiscalQuarter: q.fiscalQuarter,
          type: 'statementField',
          statementType: 'cashFlowStatement',
          fieldKey: 'dividends_paid_financing',
          sourceDescription: null,
          value: toProvenanceEntryValue(q.dividendsPaid),
        })
      ),
      {
        role: `${label}Q4 報告日流通股數`,
        fiscalYear: annual.quarters[3]!.fiscalYear,
        fiscalQuarter: 4,
        type: 'other',
        statementType: null,
        fieldKey: null,
        sourceDescription: '公開發行公司股本變動申報',
        value: toProvenanceEntryValue(annual.shares),
      },
    ];

    const entries: ProvenanceEntry[] = [
      ...buildYearEntries(`最近完整會計年度（民國 ${latestCompleteFiscalYear} 年）`, current),
      ...buildYearEntries(`${years} 年前完整會計年度（民國 ${latestCompleteFiscalYear - years} 年）`, prior),
    ];

    return {
      symbol,
      metricCode,
      found: true,
      fiscalYear,
      fiscalQuarter: seasonNum,
      value,
      entries,
      methodologyNote: `這是現金流量近似版每股股利成長率，不是官方公告的每股股利數字：年度近似每股股利 = 該年度 4 季發放股利加總取絕對值×1000(千元換元)/Q4 報告日流通股數。最近完整會計年度（民國 ${latestCompleteFiscalYear} 年）近似每股股利＝${current.dps ?? 'null'}，${years} 年前（民國 ${latestCompleteFiscalYear - years} 年）＝${prior.dps ?? 'null'}。`,
    };
  };
};
