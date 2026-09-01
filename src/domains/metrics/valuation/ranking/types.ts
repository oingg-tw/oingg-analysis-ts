export type RankingMetric = 'peRatio' | 'pbRatio' | 'dividendYield';
export type RankingOrder = 'asc' | 'desc';

export interface RankingQuery {
  metric: RankingMetric;
  order: RankingOrder;
  limit: number;
  // 選填，格式 YYYY-MM-DD；不給就抓 daily_valuation 目前最新一個交易日。
  date?: string;
}

export interface RankingRow {
  rank: number;
  symbol: string;
  companyName: string | null;
  value: number;
}

export interface RankingResult {
  metric: RankingMetric;
  order: RankingOrder;
  limit: number;
  // 實際使用的交易日；查無任何資料時為 null。
  tradeDate: string | null;
  // peRatio/pbRatio 排除了 <= 0 的公司（虧損或淨值為負，不是「便宜」，是財務體質問題，
  // 混進排行會誤導），這裡記錄排除了幾家；dividendYield 沒有這個排除，見 warnings 說明。
  excludedNonPositiveCount: number;
  rankings: RankingRow[];
  warnings: string[];
}
