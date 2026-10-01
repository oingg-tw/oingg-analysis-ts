import { rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import { trailingPeriodLabel } from '../../shared/trailingYear';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { DIVIDEND_GROWTH_LOOKBACK_YEARS, resolveChowderNumberInputs, type AnnualDividendPerShareProxyResult, type ChowderNumberDeps } from './computeChowderNumber';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-10 web-nuxt 要求：GET /companies/:symbol/metric-provenance 的 chowderNumber
// 試點，現查現算不持久化。getAnnualDividendPerShareProxy() 回傳逐季明細（見 computeChowderNumber.ts），這裡直接列出。
//
// 2026-10-01 推翻 09-10「刻意不共用 resolver、接受 ~30 行重複」的決定：溯源表全面對帳時，好幾支「各自重算」的溯源表都已經
// 跟寫入路徑漂掉（croic ×100、特別股扣除、分母守門），這支當時剛好沒漂，但同樣的重複遲早會漂。改成跟 computeChowderNumber
// 共用 resolveChowderNumberInputs，值直接取 resolution.chowderNumber。

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

export const getChowderNumberProvenance = async (query: QuarterlyMetricQuery, deps: ChowderNumberDeps): Promise<MetricProvenanceResult> => {
  const resolution = await resolveChowderNumberInputs(query, deps);

  if (!resolution) {
    return { symbol: query.symbol, metricCode: 'chowderNumber', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { symbol, seasonNum, fiscalYear, dividendYieldPct, latestCompleteFiscalYear, currentProxy, priorProxy, dividendGrowthRatePct, chowderNumber } = resolution;

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

  return {
    symbol,
    metricCode: 'chowderNumber',
    found: true,
    fiscalYear,
    fiscalQuarter: seasonNum,
    value: chowderNumber,
    entries,
    methodologyNote: `Chowder Number = 現金殖利率 + 5 年股利年複合成長率（每股股利 = 全年發放現金股利 ÷ 年底流通在外普通股）。本次 5 年股利成長率＝${dividendGrowthRatePct ?? 'null'}%。`,
  };
};
