// GET /valuation/ranking 用的 daily_valuation 排行查詢 port——TWSE/TPEx 兩個 export DB 各自查，
// 「兩邊各自解析交易日 → 合併 → 警語」的編排在 application/ranking/calculateRanking.ts。
// 實作在 infrastructure/repositories/exchange/dailyValuationRanking.ts。

export type ValuationRankingMetric = 'peRatio' | 'pbRatio' | 'dividendYield';

export interface ValuationRankingQueryResult {
  rows: { symbol: string; value: number }[]; // 該市場前 limit 名（已依 order 排好）
  excludedNonPositiveCount: number; // excludeNonPositive=true 時被排除的 <= 0 公司數
}

export interface ValuationRankingPort {
  // 該市場「referenceDate 或之前最近」的交易日（referenceDate=null 就是最新一天）；查無資料回 null。
  resolveLatestValuationTradeDate(market: 'TWSE' | 'TPEx', referenceDate: Date | null): Promise<Date | null>;
  // TWSE 要多傳 companySymbols（排除 ETF/衍生性商品/KY 股/特別股的候選集合），TPEx 的 export 本身就只有公司。
  queryTwseValuationRanking(tradeDate: Date, metric: ValuationRankingMetric, order: 'asc' | 'desc', limit: number, excludeNonPositive: boolean, companySymbols: Set<string>): Promise<ValuationRankingQueryResult>;
  queryTpexValuationRanking(tradeDate: Date, metric: ValuationRankingMetric, order: 'asc' | 'desc', limit: number, excludeNonPositive: boolean): Promise<ValuationRankingQueryResult>;
}
