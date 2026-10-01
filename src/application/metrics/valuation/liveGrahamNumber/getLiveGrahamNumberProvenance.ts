import { resolveLivePerShare } from '@/application/metrics/shared/livePerShare';
import { isBeforeLatestTradeDate, LIVE_NOT_FOUND, LIVE_PER_SHARE_NOTE, liveClosePriceEntry, livePerShareEntries } from '@/application/metrics/shared/livePerShareProvenance';
import type { MetricProvenanceResult } from '../../shared/provenance/provenanceTypes';
import { calculateLiveGrahamNumber, type LiveGrahamNumberDeps } from './computeLiveGrahamNumber';

// 2026-10-01 補溯源表——跟 computeLiveGrahamNumber 同一支 resolveLivePerShare（資產負債表＋損益表）、同一支 calculateLiveGrahamNumber。
// 只溯源最新交易日，理由見 shared/livePerShareProvenance.ts。
export const getLiveGrahamNumberProvenance = async (query: { symbol: string; dataType: '1' | '2'; subsidiaryCompanyId: string; asOfDate?: Date | undefined }, deps: LiveGrahamNumberDeps): Promise<MetricProvenanceResult> => {
  const live = await resolveLivePerShare(query, ['balanceSheet', 'incomeStatement'], deps);
  if (live.status !== 'ok' || isBeforeLatestTradeDate(query.asOfDate, live.tradeDate)) return LIVE_NOT_FOUND(query.symbol, 'liveGrahamNumber');
  const { value, peRatioTtm, pbRatio } = calculateLiveGrahamNumber(live.close, live.epsTtm, live.bvps);
  return {
    symbol: query.symbol,
    metricCode: 'liveGrahamNumber',
    found: true,
    fiscalYear: null,
    fiscalQuarter: null,
    value,
    entries: [liveClosePriceEntry(live.tradeDate, live.close), ...livePerShareEntries(live, { bvps: true, eps: true })],
    methodologyNote:
      `即時葛拉漢乘數 ＝ 本益比 × 股價淨值比 ＝（收盤價 ÷ 近四季 EPS）×（收盤價 ÷ 每股淨值），中繼值不四捨五入，最後取小數 2 位。` +
      `本益比＝${peRatioTtm ?? 'null'}、股價淨值比＝${pbRatio ?? 'null'}。${LIVE_PER_SHARE_NOTE}`,
  };
};
