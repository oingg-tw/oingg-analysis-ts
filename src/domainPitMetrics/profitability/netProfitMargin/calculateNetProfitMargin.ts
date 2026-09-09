import { determineNullReason, toPercent, type CalcResult } from '@/domainPitMetrics/numericHelpers';

// netProfitMargin = 淨利 ÷ 營收 × 100%——三因子杜邦拆解的第一項（見
// pitMetrics/shared/dupont/computeDupontFamilyPit.ts 的編排邏輯），Q/TTM 共用同一條公式，
// 差別只在呼叫端傳進來的是單季還是近四季加總值。
export const calculateNetProfitMargin = (netIncome: bigint | null, operatingRevenue: bigint | null): CalcResult => {
  const value = netIncome !== null && operatingRevenue !== null ? toPercent(netIncome, operatingRevenue) : null;
  const nullReason = value === null ? determineNullReason(netIncome, operatingRevenue) : null;
  return { value, nullReason };
};
