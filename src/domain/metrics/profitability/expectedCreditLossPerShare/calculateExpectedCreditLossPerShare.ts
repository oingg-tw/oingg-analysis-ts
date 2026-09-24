import { determineNullReason, toPerShare, type CalcResult } from '@/domain/metrics/shared/numericHelpers';

// expectedCreditLossPerShare = IFRS 9 預期信用減損損失 ÷ 流通股數。
// 這一格是瀑布圖的守門測試逼出來的：原本以為營業費用 = 推銷 + 管理 + 研發，台達電（2308）
// 115Q2 卻差了 1,019,744 千元，剛好等於這個科目。沒有恆等式測試的話，這個缺口會以
// 「營業費用那一段加不起來」的形式無聲留在圖上。
export const calculateExpectedCreditLossPerShare = (amount: bigint | null, shares: bigint | null): CalcResult => {
  const value = amount !== null && shares !== null ? toPerShare(amount, shares) : null;
  const nullReason = value === null ? determineNullReason(amount, shares) : null;
  return { value, nullReason };
};
