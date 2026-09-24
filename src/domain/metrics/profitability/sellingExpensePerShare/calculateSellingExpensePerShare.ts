import { determineNullReason, toPerShare, type CalcResult } from '@/domain/metrics/shared/numericHelpers';

// sellingExpensePerShare = 推銷費用（selling_expense） ÷ 流通股數。
// 營業費用三分拆之一：推銷 + 管理 + 研發 = 營業費用合計（2330 115Q2 實測分毫不差還原）。
export const calculateSellingExpensePerShare = (amount: bigint | null, shares: bigint | null): CalcResult => {
  const value = amount !== null && shares !== null ? toPerShare(amount, shares) : null;
  const nullReason = value === null ? determineNullReason(amount, shares) : null;
  return { value, nullReason };
};
