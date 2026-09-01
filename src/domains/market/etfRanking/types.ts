export type EtfRankingMetric =
  | 'aum'
  | 'holders'
  | 'netFlow'
  | 'dcaAmount'
  | 'return3m'
  | 'return6m'
  | 'return1y'
  | 'return2y'
  | 'return3y'
  | 'return5y'
  | 'returnYtd'
  | 'return10y'
  | 'expenseRatio';

export interface EtfRankingQuery {
  metric: EtfRankingMetric;
  order: 'asc' | 'desc';
  limit: number; // 1~50，預設 20
}

export interface EtfRankingRow {
  rank: number;
  symbol: string; // security_code
  fundName: string | null;
  shortName: string | null;
  companyName: string | null; // 發行的投信公司，不是股票上市公司，不用查 company_profile
  category: string | null;
  value: number;
  asOf: string; // 大部分 metric 是 "YYYY-MM"（月快照）；expenseRatio 是 "YYYY"（完整年度）
}

export interface EtfRankingResult {
  metric: EtfRankingMetric;
  order: 'asc' | 'desc';
  limit: number;
  rankings: EtfRankingRow[];
  warnings: string[];
}
