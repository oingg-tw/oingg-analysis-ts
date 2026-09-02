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
  category: string | null; // 原始分類字串，例如「上市ETF_國外成分證券ETF」
  market: 'TWSE' | 'TPEx' | null; // 從 category 拆出，解析不出來時是 null
  assetClass: string | null; // 從 category 拆出的成分類型，主動式 ETF 沒有這個概念時是 null
  isActive: boolean | null; // 從 category 拆出，是否為主動式 ETF，解析不出來時是 null
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
