import { determineNullReason, toPerShare, type CalcResult } from '@/domain/metrics/shared/numericHelpers';

// otherIncomePerShare = 其他收入（other_revenue） ÷ 流通股數。
// 業外損益五分拆之一，見 interestIncomePerShare 的說明。
export const calculateOtherIncomePerShare = (amount: bigint | null, shares: bigint | null): CalcResult => {
  const value = amount !== null && shares !== null ? toPerShare(amount, shares) : null;
  const nullReason = value === null ? determineNullReason(amount, shares) : null;
  return { value, nullReason };
};
