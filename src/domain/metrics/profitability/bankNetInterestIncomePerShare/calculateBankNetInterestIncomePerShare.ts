import { determineNullReason, toPerShare, type CalcResult } from '@/domain/metrics/shared/numericHelpers';

// bankNetInterestIncomePerShare = 利息淨收益 ÷ 流通股數——Q/TTM 共用同一條公式（見
// pitMetrics/profitability/bankIncomeWaterfall/computeBankIncomeWaterfallPit.ts 的編排邏輯）。
export const calculateBankNetInterestIncomePerShare = (netInterestIncome: bigint | null, shares: bigint | null): CalcResult => {
  const value = netInterestIncome !== null && shares !== null ? toPerShare(netInterestIncome, shares) : null;
  const nullReason = value === null ? determineNullReason(netInterestIncome, shares) : null;
  return { value, nullReason };
};
