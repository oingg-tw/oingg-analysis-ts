import { determineNullReason, toPerShare, type CalcResult } from '@/domain/metrics/shared/numericHelpers';

// financeCostPerShare = 財務成本（finance_costs） ÷ 流通股數。
// 業外損益五分拆之一，而且是唯一的**減項**（利息費用等）。值為正數代表成本，
// 組回業外合計時要用減的。
export const calculateFinanceCostPerShare = (amount: bigint | null, shares: bigint | null): CalcResult => {
  const value = amount !== null && shares !== null ? toPerShare(amount, shares) : null;
  const nullReason = value === null ? determineNullReason(amount, shares) : null;
  return { value, nullReason };
};
