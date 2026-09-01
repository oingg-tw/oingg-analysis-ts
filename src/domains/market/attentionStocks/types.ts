export interface AttentionStocksQuery {
  limit: number; // 1~50，預設 20
}

export interface AttentionStockRow {
  symbol: string;
  companyName: string | null;
  market: 'TWSE' | 'TPEx';
  tradeDate: string;
  criteria: string | null;
}

export interface AttentionStocksResult {
  limit: number;
  items: AttentionStockRow[];
  warnings: string[];
}
