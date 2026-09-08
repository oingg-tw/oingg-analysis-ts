import { determineNullReason, toRatio, type CalcResult } from '@/pitMetrics/numericHelpers';

// equityMultiplier = 總資產 ÷ 股東權益——三因子杜邦拆解的第三項（見
// pitMetrics/shared/dupont/computeDupontFamilyPit.ts 的編排邏輯），槓桿指標，只有一個 basis
// （Q），沒有 TTM 版本（資產負債表是時點數字，沒有「近四季加總」的概念）。
export const calculateEquityMultiplier = (totalAssets: bigint | null, equity: bigint | null): CalcResult => {
  const value = totalAssets !== null && equity !== null ? toRatio(totalAssets, equity) : null;
  const nullReason = value === null ? determineNullReason(totalAssets, equity) : null;
  return { value, nullReason };
};
