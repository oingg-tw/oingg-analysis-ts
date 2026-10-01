import { resolveLivePerShare, type LivePerShareDeps } from '@/application/metrics/shared/livePerShare';
import { isBeforeLatestTradeDate, LIVE_NOT_FOUND, LIVE_PER_SHARE_NOTE, liveClosePriceEntry, livePerShareEntries } from '@/application/metrics/shared/livePerShareProvenance';
import { toRatioFromNumbers } from '@/domain/metrics/shared/numericHelpers';
import type { MetricProvenanceResult } from '../../shared/provenance/provenanceTypes';

// 2026-10-01 補溯源表——跟 computeLivePbRatio 同一支 resolveLivePerShare（['balanceSheet']）、同一個 toRatioFromNumbers。
// 只溯源最新交易日，理由見 shared/livePerShareProvenance.ts。
export const getLivePbRatioProvenance = async (query: { symbol: string; dataType: '1' | '2'; subsidiaryCompanyId: string; asOfDate?: Date | undefined }, deps: LivePerShareDeps): Promise<MetricProvenanceResult> => {
  const live = await resolveLivePerShare(query, ['balanceSheet'], deps);
  if (live.status !== 'ok' || isBeforeLatestTradeDate(query.asOfDate, live.tradeDate)) return LIVE_NOT_FOUND(query.symbol, 'livePbRatio');
  const value = live.bvps !== null ? toRatioFromNumbers(live.close, live.bvps) : null;
  return {
    symbol: query.symbol,
    metricCode: 'livePbRatio',
    found: true,
    fiscalYear: null,
    fiscalQuarter: null,
    value,
    entries: [liveClosePriceEntry(live.tradeDate, live.close), ...livePerShareEntries(live, { bvps: true, eps: false })],
    methodologyNote: `即時股價淨值比 ＝ 收盤價 ÷ 每股淨值（換算到當天股數基準），四捨五入到小數 2 位。${LIVE_PER_SHARE_NOTE}`,
  };
};
