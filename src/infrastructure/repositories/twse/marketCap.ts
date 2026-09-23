import { twseExportPrisma } from '@/infrastructure/prisma/twseExportClient';
import { tpexExportPrisma } from '@/infrastructure/prisma/tpexExportClient';
import { getPaidInSharesAsOf } from '../mops/capitalStock';
import { getDailyValuationAsOf, getLatestDailyPrice, getLatestDailyPricesBatch, getDailyPriceHistory } from '../exchange/twseMarketData';
import { getEarliestTradeDate, listDailyClosesSince, listTaiexClosesSince } from './dailyPriceSeries';
import { getExDividendCalendar, getUpcomingExDividendNotices } from './exDividendNotice';
import { getForeignShareholdingHistory } from './foreignShareholding';
import { getStockPledgeRatioHistory } from './stockPledgeRatio';
import type { MarketCapAsOf, StockPriceAsOf, MarketDataPort } from '@/application/ports/marketData';

// 兩個回傳型別 2026-09-17 Phase 3 搬到 application/ports/marketData.ts，這裡 re-export 給既有 import 路徑。
export type { MarketCapAsOf, StockPriceAsOf };

interface RawPriceRow {
  trade_date: Date;
  close: unknown;
}

// 只查股價，不查股本——FCF_Yield 這類「每股數字 / 股價」的指標不需要流通股數（分子已經是
// 每股金額，不用重建總額），用 getMarketCapAsOf 會多一次不必要的 capital_stock_history 查詢，
// 也會因為股本查無資料而白白讓整個結果變 null。跟 getMarketCapAsOf 共用同一段股價查詢邏輯。
// 2026-09-03 使用者決定 curated 中台層現階段太早，改回直接查 twseExportPrisma（export schema
// 沒有唯一識別欄位，走 $queryRaw）。
//
// **2026-09-06 加上 `close IS NOT NULL`**：`daily_price` 對每個交易日都會有一列，沒成交的
// 那天 `close` 是 null（不是沒有這一天的紀錄）。原本只抓「最新一列」，冷門股票（例如特別股
// 1312A）好幾天沒成交時，會直接回傳 null，即使往前一兩天就有真實成交價——用特別股功能實測
// 時發現的，改成找「最近一筆真的有成交價的日期」，不是「最新一列」，避免這種可以往前找到
// 真實價格的情況被誤判成查無股價。
//
// **2026-09-24 補上上櫃**：這支先前只查 twse 的 daily_price，所以**所有上櫃公司的市值都算不出來**
// （marketCap 在 115Q2 有 1,255 家 missing_input，實測其中 1,230 家的成因是查不到股價、只有 73 家是
// 缺股本）。實際兩邊都有資料：twse 1,451 檔（2020-11 起）、**tpex 11,197 檔（2021-09 起）**——
// 不是上游沒收，是我們沒去 tpex 拿。一家公司只會掛在其中一個市場，所以「先查上市、查無再查上櫃」
// 不會重複也不會衝突（跟 twse/monthlyRevenue.ts 同一天修的是同一類 bug、同一個解法）。
const queryPriceRow = (db: typeof twseExportPrisma | typeof tpexExportPrisma, symbol: string, asOfDate: Date) =>
  db.$queryRaw<RawPriceRow[]>`
    SELECT trade_date, close FROM "export"."daily_price"
    WHERE symbol = ${symbol} AND trade_date <= ${asOfDate} AND close IS NOT NULL
    ORDER BY trade_date DESC LIMIT 1
  `;

const getPriceRowAsOf = async (symbol: string, asOfDate: Date): Promise<{ tradeDate: Date; close: unknown } | null> => {
  const listed = await queryPriceRow(twseExportPrisma, symbol, asOfDate);
  const rows = listed.length > 0 ? listed : await queryPriceRow(tpexExportPrisma, symbol, asOfDate);
  const row = rows[0];
  return row ? { tradeDate: row.trade_date, close: row.close } : null;
};

export const getStockPriceAsOf = async (symbol: string, asOfDate: Date): Promise<StockPriceAsOf | null> => {
  const priceRow = await getPriceRowAsOf(symbol, asOfDate);
  if (!priceRow || priceRow.close === null) return null;
  return { closePrice: Number(priceRow.close), tradeDate: priceRow.tradeDate.toISOString().slice(0, 10) };
};

// 市值 = 個股收盤價 x 流通股數（capital_stock_history，asOfDate 當下生效的股本，見
// getPaidInSharesAsOf）——跨兩個資料庫組合：股價查 oingg-twse 的 daily_price，股本查 mops 的
// capital_stock_history，各自獨立查詢後在這裡合併，不是一個 join。
//
// **2026-08-30 改用 oingg-twse `daily_price`，不再用 mops `daily_stock_price`**：mops 那張表
// 在同一天連 `daily_market_index` 一起從資料庫裡消失了（不是覆蓋率限制，是表本身不存在了，
// 原因不明，可能是對方在重構），會讓查詢直接噴 `PrismaClientKnownRequestError`。剛好同一時間
// oingg-twse 的 `daily_price` 針對種子公司（2330/2881/2867/2801/2207/2855）回填了完整歷史
// （2021-09 至今，約 5 年，用 `pnpm prisma:twse:pull` 重新內省過，欄位是 `close` 不是
// `closePrice`），涵蓋深度已經追上、甚至超過 mops 原本能提供的範圍，改用這條路線同時解決了
// mops 那張表消失的問題，也讓歷史回溯能力變得更好（可以查到這幾家公司歷史上幾乎每一季的市值，
// 不是只有最新一季）。
//
// **上面那段「覆蓋率限於 6 家種子公司」已經過時**（2026-09-24 實測）：twse daily_price 現在有 1,451 檔、
// 2020-11 起；tpex 有 11,197 檔、2021-09 起。不要在呼叫端寫死特定公司代號判斷「這家公司有沒有股價資料」，
// 覆蓋率會繼續變（查無資料就回 null 讓指標記 missing_input）。
export const getMarketCapAsOf = async (symbol: string, asOfDate: Date): Promise<MarketCapAsOf | null> => {
  const [priceRow, shares] = await Promise.all([getPriceRowAsOf(symbol, asOfDate), getPaidInSharesAsOf(symbol, asOfDate)]);

  if (!priceRow || priceRow.close === null || !shares) return null;

  return {
    marketCap: Number(priceRow.close) * Number(shares.paidInShares),
    tradeDate: priceRow.tradeDate.toISOString().slice(0, 10),
    closePrice: Number(priceRow.close),
    paidInShares: shares.paidInShares,
  };
};

// application/ports/marketData.ts 的實作——組合這支檔案的 asOf 查詢、exchange/twseMarketData.ts 的
// 每日估值/最新股價（twse 查無再查 tpex）、twse/dailyPriceSeries.ts 的收盤價序列。
export const twseMarketData: MarketDataPort = {
  getStockPrice: getStockPriceAsOf,
  getMarketCap: getMarketCapAsOf,
  getDailyValuation: getDailyValuationAsOf,
  getLatestDailyPrice,
  listDailyClosesSince,
  listTaiexClosesSince,
  getEarliestTradeDate,
  getLatestDailyPricesBatch,
  getDailyPriceHistory,
  getUpcomingExDividendNotices,
  getExDividendCalendar,
  getForeignShareholdingHistory,
  getStockPledgeRatioHistory,
};
