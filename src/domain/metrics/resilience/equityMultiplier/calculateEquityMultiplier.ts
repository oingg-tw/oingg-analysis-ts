import { determineNullReason, toRatio4, type CalcResult } from '@/domain/metrics/shared/numericHelpers';

// equityMultiplier = 總資產 ÷ 股東權益——三因子杜邦拆解的第三項（見 application/metrics/shared/dupont/
// computeDupontFamily.ts 的編排邏輯）。2026-09-22 起兩個輸入都是期間平均值（Q 兩點、TTM 5 點，見
// application/metrics/shared/averageBalances.ts），所以有 Q/TTM 兩個 basis；這裡只做除法。
export const calculateEquityMultiplier = (totalAssets: bigint | null, equity: bigint | null): CalcResult => {
  const value = totalAssets !== null && equity !== null ? toRatio4(totalAssets, equity) : null;
  const nullReason = value === null ? determineNullReason(totalAssets, equity) : null;
  return { value, nullReason };
};
