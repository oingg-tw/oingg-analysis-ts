import { determineNullReason, toPercent, type CalcResult } from '@/domainPitMetrics/numericHelpers';

// grossMargin = 毛利（或保險業替代科目 insurance_service_result）÷ 營收——Q/TTM 共用同一
// 條公式（見 pitMetrics/profitability/margins/computeMarginsFamilyPit.ts 的編排邏輯），
// 差別只在呼叫端傳進來的是單季還是近四季加總值。
export const calculateGrossMargin = (grossProfitLike: bigint | null, revenue: bigint | null): CalcResult => {
  const value = grossProfitLike !== null && revenue !== null ? toPercent(grossProfitLike, revenue) : null;
  const nullReason = value === null ? determineNullReason(grossProfitLike, revenue) : null;
  return { value, nullReason };
};
