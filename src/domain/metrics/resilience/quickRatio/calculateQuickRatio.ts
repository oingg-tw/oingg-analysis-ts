import { determineNullReason, toPercent, type CalcResult } from '@/domain/metrics/shared/numericHelpers';

// quickRatio（速動比率）= (流動資產 − 存貨) ÷ 流動負債——純資產負債表時點快照，只有 Q 一種
// basis（見 pitMetrics/resilience/liquidityRatio/computeLiquidityRatioPit.ts 的編排邏輯）。
// 「流動資產減存貨」只有這支指標用到，不是跨指標共用的中繼值，直接內含在公式裡，不用另開
// 中繼計算檔案（跟 pitMetrics/shared/dupont/ebit.ts 那種「多個計算檔案共用」的情況不一樣）。
export const calculateQuickRatio = (currentAssets: bigint | null, inventory: bigint | null, currentLiabilities: bigint | null): CalcResult => {
  const quickAssets = currentAssets !== null && inventory !== null ? currentAssets - inventory : null;
  const value = quickAssets !== null && currentLiabilities !== null ? toPercent(quickAssets, currentLiabilities) : null;
  const nullReason = value === null ? determineNullReason(quickAssets, currentLiabilities) : null;
  return { value, nullReason };
};
