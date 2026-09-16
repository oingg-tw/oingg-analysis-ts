import { determineNullReason, toPerShare, type CalcResult } from '@/domain/metrics/shared/numericHelpers';

// grossProfitPerShare = 毛利 ÷ 流通股數——Q/TTM 共用同一條公式（見
// pitMetrics/profitability/incomeStatementPerShare/computeIncomeStatementPerSharePit.ts
// 的編排邏輯）。直接讀損益表 gross_profit 欄位，不是用 grossMargin×revenuePerShare
// 反推——避免 margin 欄位本身已經四捨五入過一次，兩層捨入疊加出跟原始金額對不上的數字。
export const calculateGrossProfitPerShare = (grossProfit: bigint | null, shares: bigint | null): CalcResult => {
  const value = grossProfit !== null && shares !== null ? toPerShare(grossProfit, shares) : null;
  const nullReason = value === null ? determineNullReason(grossProfit, shares) : null;
  return { value, nullReason };
};
