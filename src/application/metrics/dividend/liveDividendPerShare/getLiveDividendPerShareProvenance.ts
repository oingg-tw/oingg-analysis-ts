import type { MetricProvenanceResult } from '../../shared/provenance/provenanceTypes';
import { isBeforeLatestTradeDate, LIVE_NOT_FOUND } from '../../shared/livePerShareProvenance';
import { buildDividendWindowProvenance } from '../dividendPerShare/getDividendPerShareProvenance';
import type { LiveDividendPerShareDeps } from './computeLiveDividendPerShare';

// 2026-10-05 溯源表（使用者：「溯源表請務必都加上」）：跟 computeLiveDividendPerShare 同一個窗口終點（最新交易日）與同一批函式。
// 跟其他 live* 一樣只溯源最新交易日（asOfDate 早於它回 found=false），不重建歷史。
export const getLiveDividendPerShareProvenance = async (query: { symbol: string; asOfDate?: Date | undefined }, deps: LiveDividendPerShareDeps): Promise<MetricProvenanceResult> => {
  const latestPrice = await deps.market.getLatestDailyPrice(query.symbol);
  if (!latestPrice || isBeforeLatestTradeDate(query.asOfDate, latestPrice.tradeDate)) return LIVE_NOT_FOUND(query.symbol, 'liveDividendPerShare');
  const { calc, entries, methodologyNote } = await buildDividendWindowProvenance(query.symbol, latestPrice.tradeDate, deps);
  return { symbol: query.symbol, metricCode: 'liveDividendPerShare', found: true, fiscalYear: null, fiscalQuarter: null, value: calc.value, entries, methodologyNote };
};
