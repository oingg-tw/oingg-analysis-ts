import { determineNullReason, toPerShare, type CalcResult } from '@/domain/metrics/shared/numericHelpers';

// otherGainsLossesPerShare = 其他利益及損失（other_gains_losses） ÷ 流通股數。
// 業外損益五分拆之一。這一項通常是業外波動的主要來源（處分投資損益、外幣兌換損益都在裡面），
// 可以是負數。要再往下拆到「處分投資 vs 匯兌」得接 nonoperating_income_expense_detail_xbrl，
// 目前沒做。
export const calculateOtherGainsLossesPerShare = (amount: bigint | null, shares: bigint | null): CalcResult => {
  const value = amount !== null && shares !== null ? toPerShare(amount, shares) : null;
  const nullReason = value === null ? determineNullReason(amount, shares) : null;
  return { value, nullReason };
};
