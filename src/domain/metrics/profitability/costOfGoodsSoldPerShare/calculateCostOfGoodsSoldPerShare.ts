import { determineNullReason, toPerShare, type CalcResult } from '@/domain/metrics/shared/numericHelpers';

// costOfGoodsSoldPerShare = 營業成本 ÷ 流通股數——只有 TTM 一種 basis（見 definition 的說明）。
// 直接讀損益表 operating_costs 科目，不是用 revenuePerShare − grossProfitPerShare 反推——
// 理由同 calculateGrossProfitPerShare.ts：避免疊加兩個已經各自捨入過的欄位的誤差。
export const calculateCostOfGoodsSoldPerShare = (operatingCost: bigint | null, shares: bigint | null): CalcResult => {
  const value = operatingCost !== null && shares !== null ? toPerShare(operatingCost, shares) : null;
  const nullReason = value === null ? determineNullReason(operatingCost, shares) : null;
  return { value, nullReason };
};
