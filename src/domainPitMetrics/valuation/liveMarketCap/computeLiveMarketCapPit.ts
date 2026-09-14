import { getPaidInSharesAsOf } from '@/models/capitalStock';
import { getLatestDailyPrice } from '@/models/twseMarketData';
import { resolveDailyCadenceKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, type MetricValueWriteOutcome, snapshotCadenceGroup } from '../../metricValueWriter';
import type { MetricNullReason } from '../../metricBasis';
import { roundToSignificantFigures } from '../../shared/numericHelpers';

// 2026-09-11 應 web-nuxt 要求新增——marketCap（季報快照，凍結在財報公告當天的
// knowledge_date）的即時版本：用當下最新收盤價（getLatestDailyPrice）× 最新已申報流通
// 股數（getPaidInSharesAsOf 以交易日為 asOfDate），每個交易日都會變動。主要用途是讓
// NCAV（淨流動資產價值，純資產負債表快照，本身不隨股價變動）可以拿即時市值做「現在
// 貴不貴」的比較，不用等下一次季報公告——ncavBadge 既有的
// compareAgainstFieldId:'marketCap.Q' 是凍結的季報比較，liveMarketCapBadge 的
// compareAgainstFieldId:'ncav.Q' 是這支指標補上的即時方向。跟 marketCap 是刻意並存、
// 互不影響的兩支獨立 metricCode，比照 exchangePeRatio vs peRatio 的既有先例。逐日型
// （snapshotCadence='EOD'），knowledgeDate = 交易日本身。
//
// 4 位有效數字四捨五入比照 marketCap.Q 的既有慣例（見 computeMarketCapPit.ts 說明）——
// 只影響這支寫入的值本身，不影響其他指標各自獨立呼叫 getMarketCapAsOf/
// getLatestDailyPrice 拿到的完整精度原始值。

const determineNullReason = (): MetricNullReason => 'missing_input';

export interface LiveMarketCapPitQuery {
  symbol: string;
  dataType: '1' | '2';
  subsidiaryCompanyId: string;
}

type LiveOutcome = MetricValueWriteOutcome | { action: 'skipped_no_trade_date' };

export interface LiveMarketCapPitOutcome {
  symbol: string;
  tradeDate: string | null;
  eod: LiveOutcome;
}

export const computeAndWriteLiveMarketCapPit = async (query: LiveMarketCapPitQuery): Promise<LiveMarketCapPitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const latestPrice = await getLatestDailyPrice(symbol);
  if (!latestPrice || latestPrice.close === null) {
    return { symbol, tradeDate: null, eod: { action: 'skipped_no_trade_date' } };
  }
  const { tradeDate, close } = latestPrice;

  const shares = await getPaidInSharesAsOf(symbol, tradeDate);
  const sharesValue = shares?.paidInShares ?? null;

  const liveMarketCap = sharesValue !== null ? roundToSignificantFigures(close * Number(sharesValue), 4) : null;
  const nullReason: MetricNullReason | null = liveMarketCap === null ? determineNullReason() : null;

  const { knowledgeDate } = resolveDailyCadenceKnowledgeDate(tradeDate);

  const eod = await writeMetricValue({
    symbol,
    metricCode: 'liveMarketCap',
    ...snapshotCadenceGroup('EOD'),
    dataType,
    subsidiaryCompanyId,
    tradeDate,
    value: liveMarketCap,
    nullReason,
    knowledgeDate,
    knowledgeDateIsFallback: false,
  });

  return { symbol, tradeDate: tradeDate.toISOString().slice(0, 10), eod };
};
