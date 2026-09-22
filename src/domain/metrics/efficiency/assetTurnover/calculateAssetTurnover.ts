import { determineNullReason, toRatio4, type CalcResult } from '@/domain/metrics/shared/numericHelpers';

// assetTurnover = 營收 ÷ 總資產——三因子杜邦拆解的第二項（見 application/metrics/shared/dupont/
// computeDupontFamily.ts 的編排邏輯）。2026-09-22 起呼叫端傳進來的 totalAssets 是期間平均值（Q 兩點、TTM 5 點，
// 見 application/metrics/shared/averageBalances.ts），這裡只做除法，不知道也不該知道分母怎麼來的。
export const calculateAssetTurnover = (operatingRevenue: bigint | null, totalAssets: bigint | null): CalcResult => {
  const value = operatingRevenue !== null && totalAssets !== null ? toRatio4(operatingRevenue, totalAssets) : null;
  const nullReason = value === null ? determineNullReason(operatingRevenue, totalAssets) : null;
  return { value, nullReason };
};
