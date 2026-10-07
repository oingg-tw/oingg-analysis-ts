import { resolveDailyCadenceKnowledgeDate } from '../../knowledgeDate';
import { rollingWindowGroup } from '@/domain/metrics/coordinate';
import { computation, type DailyComputationBatch } from '@/domain/metrics/computation';
import type { CalcResult } from '@/domain/metrics/shared/numericHelpers';
import { subtractYears } from '@/domain/metrics/valuation/beta/calculateBeta';
import { adjustForBasisChanges, calculateFiftyTwoWeek, dedupeByTradeDate, type DailyClose, type PriceBasisChange } from '@/domain/metrics/valuation/fiftyTwoWeek/calculateFiftyTwoWeek';
import type { PitDeps } from '@/application/metrics/deps';

// 52 週三支（見 fiftyTwoWeekDefinition.ts）一次算：同一份收盤價序列、同一組股數基準事件。
// 計算日 = query.date 當天或之前最後一個有收盤價的交易日（不給 date 就是最新）；date 選填照 beta，之後要回填歷史再用。
export type FiftyTwoWeekDeps = Pick<PitDeps, 'market' | 'shares'>;

export interface FiftyTwoWeekQuery {
  symbol: string;
  date?: Date;
  dataType: '1' | '2';
  subsidiaryCompanyId: string;
}

// 多抓一個月：窗口起點那天可能剛好休市，要往前找最後一個交易日當基準。
const BASE_LOOKBACK_BUFFER_DAYS = 31;

// computeFiftyTwoWeek 跟三支溯源表共用，溯源表列出的就是算出寫入值的那些收盤價與事件。查無任何收盤價回 null。
export const resolveFiftyTwoWeek = async (symbol: string, date: Date | undefined, deps: FiftyTwoWeekDeps) => {
  const until = date ?? new Date();
  const since = new Date(subtractYears(until, 1).getTime() - BASE_LOOKBACK_BUFFER_DAYS * 86_400_000);
  const rows = await deps.market.listDailyClosesSince(symbol, since, until);
  const raw: DailyClose[] = dedupeByTradeDate(rows.flatMap((r) => (r.close === null ? [] : [{ tradeDate: r.trade_date, close: Number(r.close) }])));
  const tradeDate = raw.at(-1)?.tradeDate;
  if (!tradeDate) return null;

  const windowStart = subtractYears(tradeDate, 1);
  const { events } = await deps.shares.getShareBasisEvents(symbol, windowStart, tradeDate);
  const changes: PriceBasisChange[] = events.flatMap((e) => (e.kind === 'shareChange' ? [{ date: e.date, multiplier: e.multiplier }] : []));
  const closes = adjustForBasisChanges(raw, changes);
  return { tradeDate, windowStart, rawCloses: raw, closes, changes, result: calculateFiftyTwoWeek(closes, windowStart) };
};

export const computeFiftyTwoWeek = async (query: FiftyTwoWeekQuery, deps: FiftyTwoWeekDeps): Promise<DailyComputationBatch<'priceReturn52w' | 'distanceFrom52wHigh' | 'distanceFrom52wLow'>> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;
  const resolved = await resolveFiftyTwoWeek(symbol, query.date, deps);
  if (!resolved) {
    const skip = { action: 'skipped_no_trade_date' } as const;
    return { symbol, tradeDate: null, slots: { priceReturn52w: skip, distanceFrom52wHigh: skip, distanceFrom52wLow: skip } };
  }
  const { tradeDate, result } = resolved;
  const { knowledgeDate } = resolveDailyCadenceKnowledgeDate(tradeDate);
  const slot = (metricCode: string, calc: CalcResult) =>
    computation({ symbol, metricCode, ...rollingWindowGroup('1Y', '1D'), dataType, subsidiaryCompanyId, tradeDate, value: calc.value, nullReason: calc.nullReason, knowledgeDate, knowledgeDateIsFallback: false });

  return {
    symbol,
    tradeDate: tradeDate.toISOString().slice(0, 10),
    slots: {
      priceReturn52w: slot('priceReturn52w', result.priceReturn),
      distanceFrom52wHigh: slot('distanceFrom52wHigh', result.distanceFromHigh),
      distanceFrom52wLow: slot('distanceFrom52wLow', result.distanceFromLow),
    },
  };
};
