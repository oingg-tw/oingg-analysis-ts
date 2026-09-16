import { determineNullReason, toPerShare, type CalcResult } from '@/domain/metrics/shared/numericHelpers';

// bankNetNonInterestIncomePerShare = 非利息淨收益 ÷ 流通股數——Q/TTM 共用同一條公式（見
// pitMetrics/profitability/bankIncomeWaterfall/computeBankIncomeWaterfallPit.ts 的編排邏輯）。
export const calculateBankNetNonInterestIncomePerShare = (netNonInterestIncome: bigint | null, shares: bigint | null): CalcResult => {
  const value = netNonInterestIncome !== null && shares !== null ? toPerShare(netNonInterestIncome, shares) : null;
  const nullReason = value === null ? determineNullReason(netNonInterestIncome, shares) : null;
  return { value, nullReason };
};
