import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import { resolveCashFlowReportDate, trailingPeriodLabel } from '../../shared/trailingYear';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import { getAnnualDividendPerShareProxy, type AnnualDividendPerShareProxyResult, type ChowderNumberDeps } from './computeChowderNumber';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-10 web-nuxt 要求：GET /companies/:symbol/metric-provenance 的 chowderNumber
// 試點，現查現算不持久化。刻意不跟 computeAndWriteChowderNumberPit 共用一個 resolver——
// 這支指標混合兩個獨立來源（市場殖利率快照 + 重建的 5 年股利成長率），抽共用 resolver
// 對這支效益不高、改動面反而更大，改成接受小範圍（~30 行）重複，跟寫入路徑各自獨立查一次。
// getAnnualDividendPerShareProxy() 已經改成回傳逐季明細（見 computeChowderNumberPit.ts），
// 這裡直接複用那個函式本身，避免重寫一次「4 季現金流量表 + 股本查詢」的邏輯。

const DIVIDEND_GROWTH_LOOKBACK_YEARS = 5;

// 2026-10-01 期間標籤跟年度加總的來源一致（興櫃半年頻：上下半年，見 shared/trailingYear.ts）；年份改用 trailingPeriodLabel 的民國年。
const buildDividendsPaidEntries = (proxy: AnnualDividendPerShareProxyResult): ProvenanceEntry[] =>
  proxy.quarters.map((q) => ({
    role: `${trailingPeriodLabel({ year: String(q.rocYear), season: String(q.season) as Season }, proxy.basis)}發放現金股利`,
    fiscalYear: rocYearToGregorian(q.rocYear),
    fiscalQuarter: q.season,
    type: 'statementField',
    statementType: 'cashFlowStatement',
    fieldKey: q.dividendsPaidFieldKey,
    sourceDescription: null,
    value: toProvenanceEntryValue(q.dividendsPaid),
  }));

// 借用 computeChowderNumber 的 getAnnualDividendPerShareProxy（要 shares），deps 直接用它那一組。
export const getChowderNumberProvenance = async (query: QuarterlyMetricQuery, deps: ChowderNumberDeps): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['cashFlowStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'chowderNumber', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  // 2026-10-01 本季期末日跟 compute 一樣走 resolveCashFlowReportDate（興櫃沒有單季現金流，見 shared/trailingYear.ts）。
  const reportDate = await resolveCashFlowReportDate({ symbol, rocYear, season: String(seasonNum) as Season, dataType, subsidiaryCompanyId }, deps);
  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);

  const dailyValuation = mainAnchor ? await deps.market.getDailyValuation(symbol, mainAnchor.knowledgeDate) : null;
  const dividendYieldPct = dailyValuation?.dividendYield ?? null;

  const latestCompleteFiscalYear = seasonNum === 4 ? rocYear : rocYear - 1;
  const [currentProxy, priorProxy] = await Promise.all([
    getAnnualDividendPerShareProxy(symbol, latestCompleteFiscalYear, dataType, subsidiaryCompanyId, deps),
    getAnnualDividendPerShareProxy(symbol, latestCompleteFiscalYear - DIVIDEND_GROWTH_LOOKBACK_YEARS, dataType, subsidiaryCompanyId, deps),
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
    ...buildDividendsPaidEntries(currentProxy),
    ...buildDividendsPaidEntries(priorProxy),
    {
      role: `${rocYearToGregorian(latestCompleteFiscalYear)} 年底流通股數`,
      fiscalYear: rocYearToGregorian(latestCompleteFiscalYear),
      fiscalQuarter: null,
      type: 'other',
      statementType: null,
      fieldKey: null,
      sourceDescription: '公開發行公司股本變動申報',
      value: currentProxy.shares ? currentProxy.shares.outstandingCommonShares.toString() : null,
    },
    {
      role: `${rocYearToGregorian(latestCompleteFiscalYear - DIVIDEND_GROWTH_LOOKBACK_YEARS)} 年底流通股數`,
      fiscalYear: rocYearToGregorian(latestCompleteFiscalYear - DIVIDEND_GROWTH_LOOKBACK_YEARS),
      fiscalQuarter: null,
      type: 'other',
      statementType: null,
      fieldKey: null,
      sourceDescription: '公開發行公司股本變動申報',
      value: priorProxy.shares ? priorProxy.shares.outstandingCommonShares.toString() : null,
    },
  ];

  return { symbol, metricCode: 'chowderNumber', found: true, fiscalYear, fiscalQuarter: seasonNum, value: chowderNumber, entries, methodologyNote: null };
};
