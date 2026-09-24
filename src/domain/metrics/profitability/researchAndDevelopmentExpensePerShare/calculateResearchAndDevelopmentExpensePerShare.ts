import { determineNullReason, toPerShare, type CalcResult } from '@/domain/metrics/shared/numericHelpers';

// researchAndDevelopmentExpensePerShare = 研發費用（research_and_development_expense） ÷ 流通股數。
// 營業費用三分拆之一。跟 rdIntensity（研發費用÷營收）讀同一個科目但不同用途：這支是金額的每股化，
// 給瀑布圖當一個可加總的區塊用；rdIntensity 是比率。覆蓋率約 67%（沒有研發支出的產業本來就不揭露），
// 比推銷/管理低是正常的。
export const calculateResearchAndDevelopmentExpensePerShare = (amount: bigint | null, shares: bigint | null): CalcResult => {
  const value = amount !== null && shares !== null ? toPerShare(amount, shares) : null;
  const nullReason = value === null ? determineNullReason(amount, shares) : null;
  return { value, nullReason };
};
