import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getCashFlowStatementXbrlFirst as getQuarterlyCashFlowStatement } from '@/shared/sourceData/cashFlowStatementXbrlFirst';
import { getDailyValuationAsOf } from '@/shared/sourceData/twseMarketData';
import { rocYearToGregorian } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import { getAnnualDividendPerShareProxy, type AnnualDividendPerShareProxyResult } from './computeChowderNumberPit';
import type { MetricProvenanceResult, ProvenanceEntry } from '../../provenance/provenanceTypes';

// 2026-09-10 web-nuxt 要求：GET /companies/:symbol/metric-provenance 的 chowderNumber
// 試點，現查現算不持久化。刻意不跟 computeAndWriteChowderNumberPit 共用一個 resolver——
// 這支指標混合兩個獨立來源（市場殖利率快照 + 重建的 5 年股利成長率），抽共用 resolver
// 對這支效益不高、改動面反而更大，改成接受小範圍（~30 行）重複，跟寫入路徑各自獨立查一次。
// getAnnualDividendPerShareProxy() 已經改成回傳逐季明細（見 computeChowderNumberPit.ts），
// 這裡直接複用那個函式本身，避免重寫一次「4 季現金流量表 + 股本查詢」的邏輯。

const DIVIDEND_GROWTH_LOOKBACK_YEARS = 5;

const toEntryValue = (value: bigint | number | null): string | number | null => {
  if (value === null) return null;
  return typeof value === 'bigint' ? value.toString() : value;
};

const buildDividendsPaidEntries = (proxy: AnnualDividendPerShareProxyResult, label: string): ProvenanceEntry[] =>
  proxy.quarters.map((q) => ({
    role: `${label} 第 ${q.season} 季發放現金股利`,
    fiscalYear: rocYearToGregorian(q.rocYear),
    fiscalQuarter: q.season,
    type: 'statementField',
    statementType: 'cashFlowStatement',
    fieldKey: 'dividends_paid_financing',
    sourceDescription: null,
    value: toEntryValue(q.dividendsPaid),
  }));

export const getChowderNumberProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['cashFlowStatement']);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'chowderNumber', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const mainCashFlow = await getQuarterlyCashFlowStatement({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate: mainCashFlow?.reportDate ?? null }]);

  const dailyValuation = mainAnchor ? await getDailyValuationAsOf(symbol, mainAnchor.knowledgeDate) : null;
  const dividendYieldPct = dailyValuation?.dividendYield ?? null;

  const latestCompleteFiscalYear = seasonNum === 4 ? rocYear : rocYear - 1;
  const [currentProxy, priorProxy] = await Promise.all([
    getAnnualDividendPerShareProxy(symbol, latestCompleteFiscalYear, dataType, subsidiaryCompanyId),
    getAnnualDividendPerShareProxy(symbol, latestCompleteFiscalYear - DIVIDEND_GROWTH_LOOKBACK_YEARS, dataType, subsidiaryCompanyId),
  ]);

  const currentDps = currentProxy.dps;
  const priorDps = priorProxy.dps;
  const dividendGrowthRatePct =
    currentDps !== null && priorDps !== null && priorDps > 0
      ? Math.round((Math.pow(currentDps / priorDps, 1 / DIVIDEND_GROWTH_LOOKBACK_YEARS) - 1) * 100 * 100) / 100
      : null;
  const chowderNumber = dividendYieldPct !== null && dividendGrowthRatePct !== null ? Math.round((dividendYieldPct + dividendGrowthRatePct) * 100) / 100 : null;

  const entries: ProvenanceEntry[] = [
    {
      role: '現金殖利率（市場快照）',
      fiscalYear: null,
      fiscalQuarter: null,
      type: 'other',
      statementType: null,
      fieldKey: null,
      sourceDescription: '證交所／櫃買中心每日評價指標（本益比／股價淨值比／殖利率）',
      value: dividendYieldPct,
    },
    ...buildDividendsPaidEntries(currentProxy, `${rocYearToGregorian(latestCompleteFiscalYear)} 年`),
    ...buildDividendsPaidEntries(priorProxy, `${rocYearToGregorian(latestCompleteFiscalYear - DIVIDEND_GROWTH_LOOKBACK_YEARS)} 年`),
    {
      role: `${rocYearToGregorian(latestCompleteFiscalYear)} 年底流通股數`,
      fiscalYear: rocYearToGregorian(latestCompleteFiscalYear),
      fiscalQuarter: null,
      type: 'other',
      statementType: null,
      fieldKey: null,
      sourceDescription: '公開發行公司股本變動申報',
      value: currentProxy.shares ? currentProxy.shares.paidInShares.toString() : null,
    },
    {
      role: `${rocYearToGregorian(latestCompleteFiscalYear - DIVIDEND_GROWTH_LOOKBACK_YEARS)} 年底流通股數`,
      fiscalYear: rocYearToGregorian(latestCompleteFiscalYear - DIVIDEND_GROWTH_LOOKBACK_YEARS),
      fiscalQuarter: null,
      type: 'other',
      statementType: null,
      fieldKey: null,
      sourceDescription: '公開發行公司股本變動申報',
      value: priorProxy.shares ? priorProxy.shares.paidInShares.toString() : null,
    },
  ];

  return { symbol, metricCode: 'chowderNumber', found: true, fiscalYear, fiscalQuarter: seasonNum, value: chowderNumber, entries, methodologyNote: null };
};
