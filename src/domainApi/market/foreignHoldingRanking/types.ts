export interface ForeignHoldingRankingQuery {
  limit: number; // 1~20，預設 10——取變動幅度排序後的前幾筆，固定筆數不是百分比
}

export interface ForeignHoldingChangeRow {
  symbol: string;
  companyName: string | null;
  sharesHeldPercent: number; // 今天的外資持股比例（%）
  previousSharesHeldPercent: number; // 上一個交易日的外資持股比例（%）
  changePercentagePoints: number; // 今天 - 上一個交易日，正值代表加碼、負值代表減碼
  sharesHeld: string; // 今天的外資持股張數（BigInt 用字串傳遞）
}

export interface ForeignHoldingRankingResult {
  tradeDate: string; // 最新一個有資料的交易日
  previousTradeDate: string; // 用來比對的前一個交易日
  limit: number;
  eligibleCompanyCount: number; // 兩個交易日都有資料、可以比較的公司數
  increases: ForeignHoldingChangeRow[]; // 加碼幅度前 limit 筆，由大到小
  decreases: ForeignHoldingChangeRow[]; // 減碼幅度前 limit 筆，由小到大（減碼最多的排最前面）
  warnings: string[];
}
