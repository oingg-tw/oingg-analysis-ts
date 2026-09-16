import { determineNullReason, toPerShare, type CalcResult } from '@/domain/metrics/shared/numericHelpers';

// operatingIncomePerShare = 營業利益 ÷ 流通股數——Q/TTM 共用同一條公式（見
// pitMetrics/profitability/incomeStatementPerShare/computeIncomeStatementPerSharePit.ts
// 的編排邏輯）。直接讀損益表 profit_loss_from_operating_activities 欄位，不是用
// operatingMargin×revenuePerShare 反推，理由同 calculateGrossProfitPerShare.ts。
export const calculateOperatingIncomePerShare = (operatingIncome: bigint | null, shares: bigint | null): CalcResult => {
  const value = operatingIncome !== null && shares !== null ? toPerShare(operatingIncome, shares) : null;
  const nullReason = value === null ? determineNullReason(operatingIncome, shares) : null;
  return { value, nullReason };
};
