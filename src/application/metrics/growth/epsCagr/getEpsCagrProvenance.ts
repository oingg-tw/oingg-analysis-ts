import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { pickNetIncomeWithFieldKey as pickNetIncome, type PickedField } from '@/domain/metrics/shared/pickers';
import { rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import { resolveTrailingIncomeStatements, trailingPeriodLabel, type ReportingBasis } from '../../shared/trailingYear';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry, type ProvenanceMetricCode } from '../../shared/provenance/provenanceTypes';
import { EPS_CAGR_YEARS } from '../../../../domain/metrics/growth/epsCagr/epsCagrDefinition';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-13 使用者要求擴大稽核鏈——epsCagr{3,5,8}y = (最近一個完整會計年度 EPS / N 年前
// 完整會計年度 EPS)^(1/N) - 1。年度 EPS = 4 季淨利加總（歸屬母公司優先）/ 當年 Q4 報告日
// 流通股數。跟 computeEpsCagrFamilyPit.ts 一致。這是 3 個獨立 metricCode
// （epsCagr3y/5y/8y），這支檔案接受 years 參數，PROVENANCE_RESOLVERS 各自綁一個 years
// 值呼叫。fiscalQuarter 固定回傳查詢當下的季別（FY basis，年度資料無季別概念）。

interface AnnualEpsQuarterDetail {
  year: string; // 民國年（trailingPeriodLabel 用）
  season: Season;
  fiscalYear: number;
  fiscalQuarter: number;
  netIncome: PickedField;
}

interface AnnualEpsResult {
  eps: number | null;
  basis: ReportingBasis;
  quarters: AnnualEpsQuarterDetail[];
  shares: bigint | null;
}

const getAnnualEps = async (
  cache: Map<number, AnnualEpsResult>,
  symbol: string,
  rocYear: number,
  dataType: string,
  subsidiaryCompanyId: string, deps: EpsCagrProvenanceDeps
): Promise<AnnualEpsResult> => {
  if (cache.has(rocYear)) return cache.get(rocYear)!;

  // 2026-10-01 跟 computeEpsCagrFamily 同一套年度 EPS：共用近一年來源（興櫃半年頻：上下半年，見 shared/trailingYear.ts）、
  // 分子扣全年特別股股利、面額還原。原本這裡自己抓 4 季、沒扣特別股股利也沒做面額還原，跟寫入值對不上。
  const trailing = await resolveTrailingIncomeStatements({ symbol, rocYear, season: '4', dataType, subsidiaryCompanyId }, deps);
  const records = trailing.periods.map((p) => p.record);
  const netIncomes = records.map(pickNetIncome);
  const quarters: AnnualEpsQuarterDetail[] = trailing.periods.map((p, i) => ({ year: p.year, season: p.season, fiscalYear: rocYearToGregorian(Number(p.year)), fiscalQuarter: Number(p.season), netIncome: netIncomes[i]! }));

  if (records.some((r) => r === null) || netIncomes.some((n) => n.value === null)) {
    const result: AnnualEpsResult = { eps: null, basis: trailing.basis, quarters, shares: null };
    cache.set(rocYear, result);
    return result;
  }

  const netIncomeSum = netIncomes.reduce((sum, n) => sum + n.value!, 0n);
  const q4ReportDate = records.at(-1)!.reportDate;
  const shareInfo = await deps.shares.getOutstandingCommonShares(symbol, q4ReportDate);
  const shares = shareInfo?.outstandingCommonShares ?? null;

  const eps =
    shareInfo && shares !== null && shares !== 0n
      ? (Number(netIncomeSum - shareInfo.preferredDividendsTtmThousands) * 1000) / Number(shares) / (await deps.shares.getShareSplitFactor(symbol, q4ReportDate, new Date(Date.UTC(9999, 0, 1))))
      : null;
  const result: AnnualEpsResult = { eps, basis: trailing.basis, quarters, shares };
  cache.set(rocYear, result);
  return result;
};

type EpsCagrProvenanceDeps = Pick<PitDeps, 'statements' | 'quarters' | 'shares' | 'cumulativeStatements'>;

export const getEpsCagrProvenanceForYears = (years: (typeof EPS_CAGR_YEARS)[number], deps: EpsCagrProvenanceDeps) => {
  const metricCode = `epsCagr${years}y` as ProvenanceMetricCode;

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
    const cache = new Map<number, AnnualEpsResult>();
    const current = await getAnnualEps(cache, symbol, latestCompleteFiscalYear, dataType, subsidiaryCompanyId, deps);
    const prior = await getAnnualEps(cache, symbol, latestCompleteFiscalYear - years, dataType, subsidiaryCompanyId, deps);

    const value =
      current.eps !== null && prior.eps !== null && current.eps > 0 && prior.eps > 0
        ? Math.round((Math.pow(current.eps / prior.eps, 1 / years) - 1) * 100 * 100) / 100
        : null;

    const buildYearEntries = (label: string, annual: AnnualEpsResult): ProvenanceEntry[] => [
      ...annual.quarters.map(
        (q): ProvenanceEntry => ({
          role: `${label}${trailingPeriodLabel(q, annual.basis)}淨利`,
          fiscalYear: q.fiscalYear,
          fiscalQuarter: q.fiscalQuarter,
          type: 'statementField',
          statementType: 'incomeStatement',
          fieldKey: q.netIncome.fieldKey,
          sourceDescription: null,
          value: toProvenanceEntryValue(q.netIncome.value),
        })
      ),
      {
        role: `${label}Q4 報告日流通股數`,
        fiscalYear: annual.quarters.at(-1)!.fiscalYear,
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
      methodologyNote: `年度 EPS = 該年度 4 季淨利加總×1000(千元換元)/Q4 報告日流通股數，不是財報原始欄位。最近完整會計年度（民國 ${latestCompleteFiscalYear} 年）EPS＝${current.eps ?? 'null'}，${years} 年前（民國 ${latestCompleteFiscalYear - years} 年）EPS＝${prior.eps ?? 'null'}。CAGR = (最近/N年前)^(1/${years})-1。`,
    };
  };
};
