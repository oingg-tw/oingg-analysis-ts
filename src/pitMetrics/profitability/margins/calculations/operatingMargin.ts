import { determineNullReason, toPct, type CalcResult } from './shared';

// operatingMargin = 營業利益（或保險業替代科目 net_operating_income_loss）÷ 營收——Q/TTM
// 共用同一條公式。
export const calculateOperatingMargin = (operatingIncomeLike: bigint | null, revenue: bigint | null): CalcResult => {
  const value = operatingIncomeLike !== null && revenue !== null ? toPct(operatingIncomeLike, revenue) : null;
  const nullReason = value === null ? determineNullReason(operatingIncomeLike, revenue) : null;
  return { value, nullReason };
};
