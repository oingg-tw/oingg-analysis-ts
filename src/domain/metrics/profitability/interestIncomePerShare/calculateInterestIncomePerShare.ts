import { determineNullReason, toPerShare, type CalcResult } from '@/domain/metrics/shared/numericHelpers';

// interestIncomePerShare = 利息收入（revenue_from_interest） ÷ 流通股數。
// 業外損益五分拆之一：利息收入 + 其他收入 + 其他利益及損失 + 權益法投資損益 − 財務成本
// = 業外損益合計（2330 115Q2 實測分毫不差還原）。
export const calculateInterestIncomePerShare = (amount: bigint | null, shares: bigint | null): CalcResult => {
  const value = amount !== null && shares !== null ? toPerShare(amount, shares) : null;
  const nullReason = value === null ? determineNullReason(amount, shares) : null;
  return { value, nullReason };
};
