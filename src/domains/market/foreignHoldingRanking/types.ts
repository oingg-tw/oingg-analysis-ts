export interface ForeignHoldingRankingQuery {
  topPercent: number; // 1~50，預設 10——取變動幅度排序後的前幾 % 家公司，不是固定筆數
}

export interface ForeignHoldingChangeRow {
  symbol: string;
  sharesHeldPercent: number; // 今天的外資持股比例（%）
  previousSharesHeldPercent: number; // 上一個交易日的外資持股比例（%）
  changePercentagePoints: number; // 今天 - 上一個交易日，正值代表加碼、負值代表減碼
  sharesHeld: string; // 今天的外資持股張數（BigInt 用字串傳遞）
}

export interface ForeignHoldingRankingResult {
  tradeDate: string; // 最新一個有資料的交易日
  previousTradeDate: string; // 用來比對的前一個交易日
  topPercent: number;
  eligibleCompanyCount: number; // 兩個交易日都有資料、可以比較的公司數，前 topPercent% 是從這個母數算的
  increases: ForeignHoldingChangeRow[]; // 加碼幅度前 topPercent%，由大到小
  decreases: ForeignHoldingChangeRow[]; // 減碼幅度前 topPercent%，由小到大（減碼最多的排最前面）
  warnings: string[];
}
