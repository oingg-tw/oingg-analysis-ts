import { determineNullReason, toPercent, type CalcResult } from '@/pitMetrics/numericHelpers';

// operatingMargin = 營業利益（或保險業替代科目 net_operating_income_loss）÷ 營收——Q/TTM
// 共用同一條公式（見 pitMetrics/profitability/margins/computeMarginsFamilyPit.ts 的編排邏輯）。
export const calculateOperatingMargin = (operatingIncomeLike: bigint | null, revenue: bigint | null): CalcResult => {
  const value = operatingIncomeLike !== null && revenue !== null ? toPercent(operatingIncomeLike, revenue) : null;
  const nullReason = value === null ? determineNullReason(operatingIncomeLike, revenue) : null;
  return { value, nullReason };
};
