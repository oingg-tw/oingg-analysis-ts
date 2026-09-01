export type RevenueRankingMetric = 'yoy' | 'mom' | 'revenue';

export interface RevenueRankingQuery {
  metric: RevenueRankingMetric;
  order: 'asc' | 'desc';
  limit: number; // 1~50，預設 20
}

export interface RevenueRankingRow {
  rank: number;
  symbol: string;
  companyName: string | null;
  market: 'TWSE' | 'TPEx';
  currentMonthRevenue: string | null; // BigInt 用字串傳遞
  momChangePercent: number | null;
  yoyChangePercent: number | null;
}

export interface RevenueRankingResult {
  yearMonth: string; // 最新一個有資料的月份，YYYY-MM
  metric: RevenueRankingMetric;
  order: 'asc' | 'desc';
  limit: number;
  rankings: RevenueRankingRow[];
  warnings: string[];
}
