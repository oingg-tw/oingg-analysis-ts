export interface MarginShortRatioRankingQuery {
  limit: number; // 預設 20，上限 100
}

export interface MarginShortRatioRow {
  rank: number;
  symbol: string;
  companyName: string | null;
  market: 'TWSE' | 'TPEx';
  shortToMarginRatioPct: number; // 融券今日餘額 / 融資今日餘額 x 100
  marginTodayBalance: string; // BigInt 用字串傳遞
  shortTodayBalance: string;
}

export interface MarginShortRatioRankingResult {
  tradeDate: string;
  limit: number;
  rankings: MarginShortRatioRow[];
  warnings: string[];
}
