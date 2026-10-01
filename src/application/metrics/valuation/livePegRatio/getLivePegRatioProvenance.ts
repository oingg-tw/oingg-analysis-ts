import { resolveLivePerShare } from '@/application/metrics/shared/livePerShare';
import { isBeforeLatestTradeDate, LIVE_NOT_FOUND, LIVE_PER_SHARE_NOTE, liveClosePriceEntry, livePerShareEntries } from '@/application/metrics/shared/livePerShareProvenance';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import type { MetricProvenanceResult, ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import { calculateLivePeg, getAnnualEps, latestCompleteFiscalYearOf, PEG_GROWTH_YEARS, type LivePegRatioDeps } from './computeLivePegRatio';

// 2026-10-01 補溯源表——跟 computeLivePegRatio 同一支 resolveLivePerShare（['incomeStatement']）、同一支 getAnnualEps 與 calculateLivePeg。
// 兩個年度 EPS 是中繼值（四季淨利加總扣特別股股利 ÷ 第四季報告日股數、面額還原），只列年度 EPS 不再展開 8 季淨利。
// 只溯源最新交易日，理由見 shared/livePerShareProvenance.ts。
export const getLivePegRatioProvenance = async (query: { symbol: string; dataType: '1' | '2'; subsidiaryCompanyId: string; asOfDate?: Date | undefined }, deps: LivePegRatioDeps): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;
  const live = await resolveLivePerShare(query, ['incomeStatement'], deps);
  if (live.status !== 'ok' || isBeforeLatestTradeDate(query.asOfDate, live.tradeDate)) return LIVE_NOT_FOUND(symbol, 'livePegRatio');

  const latestYear = latestCompleteFiscalYearOf(live.rocYear, live.season);
  const priorYear = latestYear - PEG_GROWTH_YEARS;
  const cache = new Map<number, number | null>();
  const currentAnnualEps = await getAnnualEps(cache, symbol, latestYear, dataType, subsidiaryCompanyId, deps);
  const priorAnnualEps = await getAnnualEps(cache, symbol, priorYear, dataType, subsidiaryCompanyId, deps);
  const { value, peRatioTtm, epsCagr5yPct } = calculateLivePeg(live.close, live.epsTtm, currentAnnualEps, priorAnnualEps);

  const annualEntry = (rocYear: number, eps: number | null): ProvenanceEntry => ({
    role: `民國 ${rocYear} 年度 EPS（四季淨利加總扣特別股股利 ÷ 第四季報告日流通股數，面額還原到最新基準）`,
    fiscalYear: rocYearToGregorian(rocYear),
    fiscalQuarter: 4,
    type: 'other',
    statementType: null,
    fieldKey: null,
    sourceDescription: '綜合損益表四季淨利、公開發行公司股本變動申報',
    value: eps,
  });

  return {
    symbol,
    metricCode: 'livePegRatio',
    found: true,
    fiscalYear: null,
    fiscalQuarter: null,
    value,
    entries: [
      liveClosePriceEntry(live.tradeDate, live.close),
      ...livePerShareEntries(live, { bvps: false, eps: true }),
      annualEntry(latestYear, currentAnnualEps),
      annualEntry(priorYear, priorAnnualEps),
    ],
    methodologyNote:
      `即時 PEG ＝ 本益比 ÷ EPS ${PEG_GROWTH_YEARS} 年年複合成長率（%），本益比＝收盤價 ÷ 近四季 EPS（換算到當天股數基準）；` +
      `成長率用最近一個完整年度（民國 ${latestYear} 年）跟 ${PEG_GROWTH_YEARS} 年前（民國 ${priorYear} 年）的年度 EPS，兩者都要大於 0、成長率也要大於 0 才算，最後取小數 2 位。` +
      `本益比＝${peRatioTtm ?? 'null'}、EPS 年複合成長率＝${epsCagr5yPct ?? 'null'}%。${LIVE_PER_SHARE_NOTE}`,
  };
};
