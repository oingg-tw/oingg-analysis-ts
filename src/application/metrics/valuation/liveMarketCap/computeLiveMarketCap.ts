import { resolveDailyCadenceKnowledgeDate } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { roundToSignificantFigures } from '../../../../domain/metrics/shared/numericHelpers';
import { snapshotCadenceGroup } from '@/domain/metrics/coordinate';
import { computation, type DailyComputationBatch, withFormulaVersion } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-26 formulaVersion 2：流通股數改為 IAS 33 流通在外普通股（已發行 − 特別股 − 庫藏股），EPS 類分子扣特別股股利、
// 每股淨值類分子扣特別股股本；讀股數或市值的指標一起跳版，讓下游有訊號知道值變了（使用者 2026-09-26 拍板）。
// 2026-09-27 formulaVersion 3：股數換算到跟當天股價同一基準——除權了還沒登記、登記了還沒換發／恢復交易的，照市場實際交易的股數
// （見 infrastructure/repositories/mops/capitalStock.ts getShareBasisEvents；使用者：「會當下股數變更的都要」）。
export const LIVE_MARKET_CAP_FORMULA_VERSION = 3;

// 2026-09-11 應 web-nuxt 要求新增——marketCap（季報快照，凍結在財報公告當天的
// knowledge_date）的即時版本：用當下最新收盤價（getLatestDailyPrice）× 最新已申報流通
// 股數（getOutstandingCommonSharesAsOf 以交易日為 asOfDate），每個交易日都會變動。主要用途是讓
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

export type LiveMarketCapDeps = Pick<PitDeps, 'shares' | 'market'>;

export type LiveMarketCapComputationBatch = DailyComputationBatch<'eod'>;

export const computeLiveMarketCap = async (query: LiveMarketCapPitQuery, deps: LiveMarketCapDeps): Promise<LiveMarketCapComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const latestPrice = await deps.market.getLatestDailyPrice(symbol);
  if (!latestPrice || latestPrice.close === null) {
    return { symbol, tradeDate: null, slots: { eod: { action: 'skipped_no_trade_date' } } };
  }
  const { tradeDate, close } = latestPrice;

  const shares = await deps.shares.getOutstandingCommonShares(symbol, tradeDate);
  const sharesValue = shares?.outstandingCommonShares ?? null;

  const basisMultiplier = sharesValue !== null ? (await deps.shares.getShareBasisEvents(symbol, tradeDate, tradeDate)).basisMultiplier : 1;
  const liveMarketCap = sharesValue !== null ? roundToSignificantFigures(close * Number(sharesValue) * basisMultiplier, 4) : null;
  const nullReason: MetricNullReason | null = liveMarketCap === null ? determineNullReason() : null;

  const { knowledgeDate } = resolveDailyCadenceKnowledgeDate(tradeDate);

  const eod = computation({
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

  return { symbol, tradeDate: tradeDate.toISOString().slice(0, 10), slots: withFormulaVersion({ eod }, LIVE_MARKET_CAP_FORMULA_VERSION) };
};
