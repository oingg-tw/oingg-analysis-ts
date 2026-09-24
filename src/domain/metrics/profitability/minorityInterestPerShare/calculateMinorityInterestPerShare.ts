import { determineNullReason, toPerShare, type CalcResult } from '@/domain/metrics/shared/numericHelpers';

// minorityInterestPerShare = 少數股東損益 = 稅後淨利 − 歸屬母公司業主淨利 ÷ 流通股數。
// 這是「稅前淨利 − 所得稅」與 EPS 之間唯一的差額來源：稅前減所得稅等於**整體**稅後淨利，
// 而 EPS 用的是**歸屬母公司業主**淨利。沒有這一格，瀑布圖最後一段會對不起來而看不出原因
// （2330 115Q2 TTM 差 0.02 元就是這個）。覆蓋率約 50%——沒有非控制權益的公司不會揭露。
export const calculateMinorityInterestPerShare = (amount: bigint | null, shares: bigint | null): CalcResult => {
  const value = amount !== null && shares !== null ? toPerShare(amount, shares) : null;
  const nullReason = value === null ? determineNullReason(amount, shares) : null;
  return { value, nullReason };
};
