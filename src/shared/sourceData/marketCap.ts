import { twseExportPrisma } from '@/adapters/prisma/twseExportClient';
import { getPaidInSharesAsOf } from './capitalStock';

export interface MarketCapAsOf {
  marketCap: number; // 股價 x 流通股數（元）
  tradeDate: string; // YYYY-MM-DD；實際用到的股價交易日（asOfDate 或之前最近一筆）
  closePrice: number;
  paidInShares: bigint;
}

export interface StockPriceAsOf {
  closePrice: number;
  tradeDate: string; // YYYY-MM-DD；實際用到的股價交易日（asOfDate 或之前最近一筆）
}

interface RawPriceRow {
  trade_date: Date;
  close: unknown;
}

// 只查股價，不查股本——FCF_Yield 這類「每股數字 / 股價」的指標不需要流通股數（分子已經是
// 每股金額，不用重建總額），用 getMarketCapAsOf 會多一次不必要的 capital_stock_history 查詢，
// 也會因為股本查無資料而白白讓整個結果變 null。跟 getMarketCapAsOf 共用同一段股價查詢邏輯。
// 2026-09-03 使用者決定 curated 中台層現階段太早，改回直接查 twseExportPrisma（export schema
// 沒有唯一識別欄位，走 $queryRaw）。
const getPriceRowAsOf = async (symbol: string, asOfDate: Date): Promise<{ tradeDate: Date; close: unknown } | null> => {
  const rows = await twseExportPrisma.$queryRaw<RawPriceRow[]>`
    SELECT trade_date, close FROM "export"."daily_price"
    WHERE symbol = ${symbol} AND trade_date <= ${asOfDate}
    ORDER BY trade_date DESC LIMIT 1
  `;
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
// 覆蓋率限於這 6 家種子公司（歷史深度）+ 其他公司近幾個月（2026-06 起，見 hasStockPriceCoverage
// 的說明）——查詢時請用 `hasStockPriceCoverage` 現查現算，不要在呼叫端寫死特定公司代號判斷
// 「這家公司有沒有股價資料」，覆蓋率之後還會繼續變。
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

// 這家公司在 oingg-twse daily_price 裡有沒有任何一筆資料（不分日期）——用來區分「這家公司結構性
// 不在覆蓋範圍內」（not_applicable）跟「有覆蓋，但這次查詢缺別的東西」（no_data），不要在呼叫端
// 寫死特定公司代號判斷，覆蓋率會持續成長（見上方 getMarketCapAsOf 的說明）。
export const hasStockPriceCoverage = async (symbol: string): Promise<boolean> => {
  const rows = await twseExportPrisma.$queryRaw<{ symbol: string }[]>`SELECT symbol FROM "export"."daily_price" WHERE symbol = ${symbol} LIMIT 1`;
  return rows.length > 0;
};
