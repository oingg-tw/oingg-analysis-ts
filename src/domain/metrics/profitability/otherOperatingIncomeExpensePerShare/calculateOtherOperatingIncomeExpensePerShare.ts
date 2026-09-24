import { determineNullReason, toPerShare, type CalcResult } from '@/domain/metrics/shared/numericHelpers';

// otherOperatingIncomeExpensePerShare = 其他收益及費損淨額 ÷ 流通股數。
// 這一格存在的唯一理由是讓瀑布圖閉合：「毛利 − 營業費用」不一定等於營業利益，差額就是它
// （2330 115Q2 TTM 差 0.31 元）。只有約 5% 的公司有這個科目，其餘為 null 是正常的。
export const calculateOtherOperatingIncomeExpensePerShare = (amount: bigint | null, shares: bigint | null): CalcResult => {
  const value = amount !== null && shares !== null ? toPerShare(amount, shares) : null;
  const nullReason = value === null ? determineNullReason(amount, shares) : null;
  return { value, nullReason };
};
