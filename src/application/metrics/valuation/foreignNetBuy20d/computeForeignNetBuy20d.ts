import { resolveDailyCadenceKnowledgeDate } from '../../knowledgeDate';
import { rollingWindowGroup } from '@/domain/metrics/coordinate';
import { computation, type DailyComputationBatch } from '@/domain/metrics/computation';
import { calculateForeignNetBuy20d, FOREIGN_NET_BUY_DAYS } from '@/domain/metrics/valuation/foreignNetBuy20d/calculateForeignNetBuy20d';
import type { PitDeps } from '@/application/metrics/deps';

// 近 20 日外資買賣超佔流通股數比（見 foreignNetBuy20dDefinition）。計算日 = 三大法人日報在 date（不給就是今天）當天或之前最新的交易日；
// knowledge date = 計算日（日報當天收盤後公布）。
// ponytail: 窗口內遇到除權（股數基準變動），之前的買賣超股數沒換算成新基準；20 天內除權的少數公司會有小偏差，要準再用 getShareBasisEvents 的 shareChange 逐日換算。
export type ForeignNetBuy20dDeps = Pick<PitDeps, 'market' | 'shares'>;

export interface ForeignNetBuy20dQuery {
  symbol: string;
  date?: Date;
  dataType: '1' | '2';
  subsidiaryCompanyId: string;
}

// computeForeignNetBuy20d 跟溯源表共用。這檔在窗口內完全沒有列（上櫃公司、或 20 天都沒有法人交易）回 null——不寫 0，
// 上櫃公司寫 0 會在排行裡安靜地跟「外資沒買沒賣」混在一起。
export const resolveForeignNetBuy20d = async (symbol: string, date: Date | undefined, deps: ForeignNetBuy20dDeps) => {
  const window = await deps.market.getForeignNetBuyWindow(symbol, date ?? new Date(), FOREIGN_NET_BUY_DAYS);
  const tradeDate = window.tradeDates.at(-1);
  if (!tradeDate || window.rows.length === 0) return null;

  const netBuySum = window.rows.reduce((sum, r) => sum + r.netBuyShares, 0n);
  const shares = await deps.shares.getOutstandingCommonShares(symbol, tradeDate);
  const basisMultiplier = shares ? (await deps.shares.getShareBasisEvents(symbol, tradeDate, tradeDate)).basisMultiplier : 1;
  const outstanding = shares ? Number(shares.outstandingCommonShares) * basisMultiplier : null;
  return { tradeDate, window, netBuySum, shares, basisMultiplier, outstanding, result: calculateForeignNetBuy20d(netBuySum, window.tradeDates.length, outstanding) };
};

export const computeForeignNetBuy20d = async (query: ForeignNetBuy20dQuery, deps: ForeignNetBuy20dDeps): Promise<DailyComputationBatch<'foreignNetBuy20d'>> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;
  const resolved = await resolveForeignNetBuy20d(symbol, query.date, deps);
  if (!resolved) return { symbol, tradeDate: null, slots: { foreignNetBuy20d: { action: 'skipped_no_trade_date' } } };
  const { tradeDate, result } = resolved;
  const { knowledgeDate } = resolveDailyCadenceKnowledgeDate(tradeDate);
  return {
    symbol,
    tradeDate: tradeDate.toISOString().slice(0, 10),
    slots: {
      foreignNetBuy20d: computation({ symbol, metricCode: 'foreignNetBuy20d', ...rollingWindowGroup('20D', '1D'), dataType, subsidiaryCompanyId, tradeDate, value: result.value, nullReason: result.nullReason, knowledgeDate, knowledgeDateIsFallback: false }),
    },
  };
};
