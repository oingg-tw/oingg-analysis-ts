import { determineNullReason, toPerShare, type CalcResult } from '@/domain/metrics/shared/numericHelpers';

// dividendPerShare = 現金股利發放（財務活動現金流出，取絕對值）÷ 流通股數——只有 TTM
// 一種 basis（股利通常一年發放 1-2 次，單季數字大多是 0，會嚴重失真，跟
// dividendPayoutRatio 同一個理由，見 computeDividendPerSharePit.ts 的說明）。
export const calculateDividendPerShare = (dividendsPaid: bigint | null, shares: bigint | null): CalcResult => {
  const value = dividendsPaid !== null && shares !== null ? toPerShare(dividendsPaid, shares) : null;
  const nullReason = value === null ? determineNullReason(dividendsPaid, shares) : null;
  return { value, nullReason };
};
