import { determineNullReason, toPerShare, type CalcResult } from '@/domain/metrics/shared/numericHelpers';

// administrativeExpensePerShare = 管理費用（administrative_expense） ÷ 流通股數。
// 營業費用三分拆之一，見 sellingExpensePerShare 的說明。
export const calculateAdministrativeExpensePerShare = (amount: bigint | null, shares: bigint | null): CalcResult => {
  const value = amount !== null && shares !== null ? toPerShare(amount, shares) : null;
  const nullReason = value === null ? determineNullReason(amount, shares) : null;
  return { value, nullReason };
};
