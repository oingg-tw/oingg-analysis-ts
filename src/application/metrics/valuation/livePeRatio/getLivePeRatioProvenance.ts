import { resolveLivePerShare, type LivePerShareDeps } from '@/application/metrics/shared/livePerShare';
import { isBeforeLatestTradeDate, LIVE_NOT_FOUND, LIVE_PER_SHARE_NOTE, liveClosePriceEntry, livePerShareEntries } from '@/application/metrics/shared/livePerShareProvenance';
import { toRatioFromNumbers } from '@/domain/metrics/shared/numericHelpers';
import type { MetricProvenanceResult } from '../../shared/provenance/provenanceTypes';

// 2026-10-01 補溯源表——跟 computeLivePeRatio 同一支 resolveLivePerShare（['incomeStatement']）、同一個 toRatioFromNumbers。
// 只溯源最新交易日，理由見 shared/livePerShareProvenance.ts。
export const getLivePeRatioProvenance = async (query: { symbol: string; dataType: '1' | '2'; subsidiaryCompanyId: string; asOfDate?: Date | undefined }, deps: LivePerShareDeps): Promise<MetricProvenanceResult> => {
  const live = await resolveLivePerShare(query, ['incomeStatement'], deps);
  if (live.status !== 'ok' || isBeforeLatestTradeDate(query.asOfDate, live.tradeDate)) return LIVE_NOT_FOUND(query.symbol, 'livePeRatio');
  const value = live.epsTtm !== null ? toRatioFromNumbers(live.close, live.epsTtm) : null;
  return {
    symbol: query.symbol,
    metricCode: 'livePeRatio',
    found: true,
    fiscalYear: null,
    fiscalQuarter: null,
    value,
    entries: [liveClosePriceEntry(live.tradeDate, live.close), ...livePerShareEntries(live, { bvps: false, eps: true })],
    methodologyNote: `即時本益比 ＝ 收盤價 ÷ 近四季 EPS（換算到當天股數基準），四捨五入到小數 2 位；近四季任一季淨利缺漏不算。${LIVE_PER_SHARE_NOTE}`,
  };
};
