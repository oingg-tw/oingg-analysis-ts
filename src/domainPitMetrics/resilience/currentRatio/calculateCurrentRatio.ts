import { determineNullReason, toPercent, type CalcResult } from '@/domainPitMetrics/shared/numericHelpers';

// currentRatio（流動比率）= 流動資產 ÷ 流動負債——純資產負債表時點快照，只有 Q 一種 basis
// （見 pitMetrics/resilience/liquidityRatio/computeLiquidityRatioPit.ts 的編排邏輯）。
export const calculateCurrentRatio = (currentAssets: bigint | null, currentLiabilities: bigint | null): CalcResult => {
  const value = currentAssets !== null && currentLiabilities !== null ? toPercent(currentAssets, currentLiabilities) : null;
  const nullReason = value === null ? determineNullReason(currentAssets, currentLiabilities) : null;
  return { value, nullReason };
};
