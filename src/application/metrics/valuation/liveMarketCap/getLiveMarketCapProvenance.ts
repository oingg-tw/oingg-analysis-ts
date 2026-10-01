import { isBeforeLatestTradeDate, LIVE_NOT_FOUND, liveClosePriceEntry } from '@/application/metrics/shared/livePerShareProvenance';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import { resolveLiveMarketCap, type LiveMarketCapDeps } from './computeLiveMarketCap';

// 2026-10-01 補溯源表——跟 computeLiveMarketCap 同一支 resolveLiveMarketCap，三個輸入（收盤價、股數、股數基準倍數）就是算出寫入值的那三個。
// 只溯源最新交易日（收盤價取最新一筆，見 shared/livePerShareProvenance.ts）。
export const getLiveMarketCapProvenance = async (query: { symbol: string; asOfDate?: Date | undefined }, deps: LiveMarketCapDeps): Promise<MetricProvenanceResult> => {
  const live = await resolveLiveMarketCap(query.symbol, deps);
  if (!live || isBeforeLatestTradeDate(query.asOfDate, live.tradeDate)) return LIVE_NOT_FOUND(query.symbol, 'liveMarketCap');
  const tradeDate = live.tradeDate.toISOString().slice(0, 10);
  const entries: ProvenanceEntry[] = [
    liveClosePriceEntry(live.tradeDate, live.close),
    {
      role: `流通在外普通股股數（${tradeDate} 當下最新申報，已發行 − 特別股 − 庫藏股）`,
      fiscalYear: null,
      fiscalQuarter: null,
      type: 'other',
      statementType: null,
      fieldKey: null,
      sourceDescription: '公開發行公司股本變動申報',
      value: toProvenanceEntryValue(live.shares?.outstandingCommonShares ?? null),
    },
    {
      role: '股數基準倍數（已除權、面額已換發但股本變動還沒申報的部分；沒有為 1）',
      fiscalYear: null,
      fiscalQuarter: null,
      type: 'other',
      statementType: null,
      fieldKey: null,
      sourceDescription: '公開資訊觀測站股利分派公告、股本變動申報',
      value: live.basisMultiplier,
    },
  ];
  return {
    symbol: query.symbol,
    metricCode: 'liveMarketCap',
    found: true,
    fiscalYear: null,
    fiscalQuarter: null,
    value: live.value,
    entries,
    methodologyNote:
      '即時市值 ＝ 收盤價 × 流通在外普通股股數 × 股數基準倍數，四捨五入到 4 位有效數字。股數基準倍數讓股數跟當天市場實際交易的股數一致' +
      '（除權了還沒登記、登記了還沒換發的照實際交易股數）。只溯源最新一個交易日。',
  };
};
