import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { pickNetIncomeWithFieldKey as pickNetIncome, type PickedField } from '@/domain/metrics/shared/pickers';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
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
  fiscalYear: number;
  fiscalQuarter: number;
  netIncome: PickedField;
}

interface AnnualEpsResult {
  eps: number | null;
  quarters: AnnualEpsQuarterDetail[];
  shares: bigint | null;
}

const getAnnualEps = async (
  cache: Map<number, AnnualEpsResult>,
  symbol: string,
  rocYear: number,
  dataType: string,
  subsidiaryCompanyId: string, deps: Pick<PitDeps, 'statements' | 'quarters' | 'shares'>
): Promise<AnnualEpsResult> => {
  if (cache.has(rocYear)) return cache.get(rocYear)!;

  const records = await Promise.all(
    [1, 2, 3, 4].map((quarter) => deps.statements.getIncomeStatement({ symbol, year: rocYear, quarter, dataType, subsidiaryCompanyId }))
  );
  const netIncomes = records.map(pickNetIncome);
  const quarters: AnnualEpsQuarterDetail[] = netIncomes.map((netIncome, i) => ({ fiscalYear: rocYearToGregorian(rocYear), fiscalQuarter: i + 1, netIncome }));

  if (records.some((r) => r === null) || netIncomes.some((n) => n.value === null)) {
    const result: AnnualEpsResult = { eps: null, quarters, shares: null };
    cache.set(rocYear, result);
    return result;
  }

  const netIncomeSum = netIncomes.reduce((sum, n) => sum + n.value!, 0n);
  const q4ReportDate = records[3]!.reportDate;
  const shares = (await deps.shares.getPaidInShares(symbol, q4ReportDate))?.paidInShares ?? null;

  const eps = shares !== null && shares !== 0n ? (Number(netIncomeSum) * 1000) / Number(shares) : null;
  const result: AnnualEpsResult = { eps, quarters, shares };
  cache.set(rocYear, result);
  return result;
};

export const getEpsCagrProvenanceForYears = (years: (typeof EPS_CAGR_YEARS)[number], deps: Pick<PitDeps, 'statements' | 'quarters' | 'shares'>) => {
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
          role: `${label}第 ${q.fiscalQuarter} 季淨利`,
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
      methodologyNote: `年度 EPS = 該年度 4 季淨利加總×1000(千元換元)/Q4 報告日流通股數，不是財報原始欄位。最近完整會計年度（民國 ${latestCompleteFiscalYear} 年）EPS＝${current.eps ?? 'null'}，${years} 年前（民國 ${latestCompleteFiscalYear - years} 年）EPS＝${prior.eps ?? 'null'}。CAGR = (最近/N年前)^(1/${years})-1。`,
    };
  };
};
