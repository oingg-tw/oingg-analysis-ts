// 流通股數 port——每股型指標（EPS/BVPS/每股現金流…）跟市值都靠它。注意單位：paidInShares 是
// 實際股數（不是千股），財報金額是千元，算每股數字時分子要先 ×1000，見
// domain/metrics/shared/numericHelpers.ts 的 toPerShare。實作在
// infrastructure/repositories/mops/capitalStock.ts（capital_stock_history，生效日 <= asOfDate 的最新一筆）。
export interface PaidInSharesAsOf {
  paidInShares: bigint;
  effectiveYear: number; // 西元年
  effectiveMonth: number;
}

export interface PaidInSharesPort {
  getPaidInShares(symbol: string, asOfDate: Date): Promise<PaidInSharesAsOf | null>;
}
