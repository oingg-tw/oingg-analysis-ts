import { determineNullReason, toPerShare, type PerShareCalcResult } from './shared';

// fcfPerShare = 自由現金流（見 fcf.ts）÷ 流通股數——Q/TTM 共用同一條公式。
export const calculateFcfPerShare = (fcf: bigint | null, shares: bigint | null): PerShareCalcResult => {
  const value = fcf !== null && shares !== null ? toPerShare(fcf, shares) : null;
  const quarterlyAnnualized = value !== null ? Math.round(value * 4 * 100) / 100 : null;
  const nullReason = value === null ? determineNullReason(fcf, shares) : null;
  return { value, quarterlyAnnualized, nullReason };
};
