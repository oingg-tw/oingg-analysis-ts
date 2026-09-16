// 市場行情 port（指標核心用的「某個基準日當下」查詢）。實作在 infrastructure/repositories/twse/
// marketCap.ts：股價取 asOfDate 或之前最近一筆真的有成交價的交易日；市值 = 收盤價 × 當時生效的
// 流通股數（跨 twse/mops 兩個資料庫在 repository 內組合）。
// beta 用的價格序列、live*/marketRatios 用的最新行情，之後逐 family 遷移時再加進來。

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

export interface StockPricePort {
  getStockPrice(symbol: string, asOfDate: Date): Promise<StockPriceAsOf | null>;
}

export interface MarketCapPort {
  getMarketCap(symbol: string, asOfDate: Date): Promise<MarketCapAsOf | null>;
}

export type MarketDataPort = StockPricePort & MarketCapPort;
