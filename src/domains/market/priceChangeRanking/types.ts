export interface PriceChangeRankingQuery {
  limit: number; // 1~50，預設 20，漲幅/跌幅各取這麼多筆
}

export interface PriceChangeRow {
  rank: number;
  symbol: string;
  companyName: string | null;
  market: 'TWSE' | 'TPEx';
  tradeDate: string; // 這筆資料採用的交易日——上市/上櫃各自的最新交易日可能不同
  previousTradeDate: string;
  close: number;
  previousClose: number;
  changeAmount: number; // close - previousClose
  changePercent: number; // (close - previousClose) / previousClose x 100
}

export interface PriceChangeRankingResult {
  limit: number;
  gainers: PriceChangeRow[]; // 漲幅前 limit，由大到小
  losers: PriceChangeRow[]; // 跌幅前 limit，由小到大（跌最多排最前面）
  warnings: string[];
}
