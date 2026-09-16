// 市場行情 port。四組單方法介面對應指標核心四種用法，MarketDataPort 是全部的交集：
// - 某個基準日當下的股價/市值（季報型估值指標：asOfDate = 財報公告日）。
// - 某個基準日當下的交易所每日估值（本益比/淨值比/殖利率，chowderNumber/marketRatios）。
// - 最新一筆股價（live* 指標：不看歷史，就是「現在」）。
// - 收盤價序列 + 大盤指數序列（beta 的滾動窗口）。
// 實作在 infrastructure/repositories/twse/marketCap.ts 的 twseMarketData（組合 twse/tpex 兩邊的查詢）。

export interface StockPriceAsOf {
  closePrice: number;
  tradeDate: string; // YYYY-MM-DD；實際用到的股價交易日（asOfDate 或之前最近一筆）
}

export interface MarketCapAsOf {
  marketCap: number; // 股價 x 流通股數（元）
  tradeDate: string; // YYYY-MM-DD；實際用到的股價交易日（asOfDate 或之前最近一筆）
  closePrice: number;
  paidInShares: bigint;
}

export interface DailyValuationAsOf {
  tradeDate: Date;
  peRatio: number | null;
  pbRatio: number | null;
  dividendYield: number | null;
}

export interface DailyPriceAsOf {
  tradeDate: Date;
  close: number | null;
}

// 原始 SQL 列形狀（close 是 Decimal 物件，Number() 在呼叫端做）——beta 的窗口計算讀這個。
export interface DailyCloseRow {
  trade_date: Date;
  close: unknown;
}

export interface StockPricePort {
  getStockPrice(symbol: string, asOfDate: Date): Promise<StockPriceAsOf | null>;
}

export interface MarketCapPort {
  getMarketCap(symbol: string, asOfDate: Date): Promise<MarketCapAsOf | null>;
}

export interface DailyValuationPort {
  // 指定 asOfDate 取「該日或之前」最新一筆；不指定就是整張表最新一筆。
  getDailyValuation(symbol: string, asOfDate?: Date): Promise<DailyValuationAsOf | null>;
}

export interface LatestDailyPricePort {
  getLatestDailyPrice(symbol: string): Promise<DailyPriceAsOf | null>;
}

export interface DailyPriceSeriesPort {
  // 個股/大盤自 since 起（含）依日期升冪的收盤價；until 有給就只取到 until（含）。
  listDailyClosesSince(symbol: string, since: Date, until?: Date): Promise<DailyCloseRow[]>;
  listTaiexClosesSince(since: Date, until?: Date): Promise<DailyCloseRow[]>;
  // 這檔股票最早的交易日（完全沒有股價資料回 null）。
  getEarliestTradeDate(symbol: string): Promise<Date | null>;
}

export type MarketDataPort = StockPricePort & MarketCapPort & DailyValuationPort & LatestDailyPricePort & DailyPriceSeriesPort;
