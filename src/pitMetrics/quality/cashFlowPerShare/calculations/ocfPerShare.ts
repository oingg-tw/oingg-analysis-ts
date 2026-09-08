import { determineNullReason, toPerShare, type PerShareCalcResult } from './shared';

// ocfPerShare = 營業活動現金流 ÷ 流通股數——Q/TTM 共用同一條公式，差別只在呼叫端傳進來的
// 是單季還是近四季加總的現金流。
export const calculateOcfPerShare = (operatingCashFlow: bigint | null, shares: bigint | null): PerShareCalcResult => {
  const value = operatingCashFlow !== null && shares !== null ? toPerShare(operatingCashFlow, shares) : null;
  const quarterlyAnnualized = value !== null ? Math.round(value * 4 * 100) / 100 : null;
  const nullReason = value === null ? determineNullReason(operatingCashFlow, shares) : null;
  return { value, quarterlyAnnualized, nullReason };
};
