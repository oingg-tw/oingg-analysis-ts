import { determineNullReason, toPct, type CalcResult } from './shared';

// netProfitMargin = 淨利 ÷ 營收 × 100%——三因子杜邦拆解的第一項，Q/TTM 共用同一條公式，
// 差別只在呼叫端傳進來的是單季還是近四季加總值（見 computeDupontFamilyPit.ts 的編排邏輯）。
export const calculateNetProfitMargin = (netIncome: bigint | null, operatingRevenue: bigint | null): CalcResult => {
  const value = netIncome !== null && operatingRevenue !== null ? toPct(netIncome, operatingRevenue) : null;
  const nullReason = value === null ? determineNullReason(netIncome, operatingRevenue) : null;
  return { value, nullReason };
};
