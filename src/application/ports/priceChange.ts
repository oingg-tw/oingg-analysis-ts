// 累積漲跌幅（點對點，往前數 tradingDaysBack 個交易日）port——volumeTop20/disposedStocks/attentionStocks 用。
// 實作在 infrastructure/repositories/exchange/priceChange.ts。

export interface ChangeLookupKey {
  symbol: string;
  market: 'TWSE' | 'TPEx';
  asOfDate: Date; // 以這一天（或更早的最近一個交易日）當基準日，往前數 tradingDaysBack 個交易日
}

// 回傳 Map 的 key 格式——repository 跟呼叫端共用這一支，兩邊不會各自拼字串。
export const cumulativeChangePercentKey = (market: 'TWSE' | 'TPEx', symbol: string, asOfDate: Date): string => `${market}:${symbol}:${asOfDate.toISOString().slice(0, 10)}`;

export interface PriceChangePort {
  // 每個 key 一筆（值可能是 null：資料不足）；空陣列直接回空 Map。
  getCumulativeChangePercent(keys: ChangeLookupKey[], tradingDaysBack: number): Promise<Map<string, number | null>>;
}
