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

// ---- 個股頁面用的歷史序列（GET /stocks/*）——以下 DTO 就是對外回應裡的 entry 形狀，日期一律 YYYY-MM-DD 字串，
// 數字欄位在 repository 內從 Decimal/字串轉成 number | null。對應的 zod schema（OpenAPI 文件）在
// http/modules/stocks/types.ts 用 satisfies 釘住。

export interface DailyPriceHistoryEntry {
  tradeDate: string; // "YYYY-MM-DD"
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

export interface DailyPriceHistory {
  entries: DailyPriceHistoryEntry[]; // 依交易日由舊到新
  earliestAvailableTradeDate: string | null; // 這檔股票全部歷史的最早交易日，不受 limit 影響
}

// 息=純除息、權=純除權、權息=合併發放，是同一筆事件用這個欄位標示類型。
export type ExDividendType = '息' | '權' | '權息';

export interface ExDividendNoticeEntry {
  exDate: string; // "YYYY-MM-DD"，除權息基準日
  exType: ExDividendType;
  stockDividendRatio: number | null;
  subscriptionRatio: number | null;
  subscriptionPricePerShare: number | null;
  cashDividend: number | null;
  sharesOffered: number | null;
  sharesEmpOwner: number | null;
  sharesholderOwner: number | null;
  stockHoldingRatio: number | null;
}

export interface ExDividendCalendarEntry extends ExDividendNoticeEntry {
  symbol: string;
}

export interface ForeignShareholdingEntry {
  tradeDate: string; // "YYYY-MM-DD"
  sharesHeldPercent: number | null;
  foreignLimitPercent: number | null;
  availableInvestPercent: number | null;
}

export interface StockPledgeRatioEntry {
  reportDate: string; // "YYYY-MM-DD"，TWSE 出表日期，不定期更新
  pledgePercent: number | null;
}

export interface StockHistoryPort {
  // 一次查多家公司的最新股價，查不到的 symbol 不會出現在 Map 裡。
  getLatestDailyPricesBatch(symbols: string[]): Promise<Map<string, DailyPriceAsOf>>;
  // 依交易日新到舊取最近 limit 筆再反轉成舊到新。
  getDailyPriceHistory(symbol: string, limit: number): Promise<DailyPriceHistory>;
  // 只回「今天（含）以後」的除權息預告，查不到的 symbol 不會出現在物件裡。
  getUpcomingExDividendNotices(symbols: string[]): Promise<Record<string, ExDividendNoticeEntry[]>>;
  // 日期區間內全市場的除權息事件（不篩未來），依 exDate、symbol 升冪。
  getExDividendCalendar(startDate: Date, endDate: Date): Promise<ExDividendCalendarEntry[]>;
  // 依日期新到舊取最近 limit 筆。
  getForeignShareholdingHistory(symbol: string, limit: number): Promise<ForeignShareholdingEntry[]>;
  getStockPledgeRatioHistory(symbol: string, limit: number): Promise<StockPledgeRatioEntry[]>;
}

export type MarketDataPort = StockPricePort & MarketCapPort & DailyValuationPort & LatestDailyPricePort & DailyPriceSeriesPort & StockHistoryPort;
