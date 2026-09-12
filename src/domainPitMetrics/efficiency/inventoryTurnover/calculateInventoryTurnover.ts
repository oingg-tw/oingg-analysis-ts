import { determineNullReason, toRatio, annualizeQuarterly, type AnnualizableCalcResult } from '@/domainPitMetrics/shared/numericHelpers';

// inventoryTurnover = 營業成本 ÷ 存貨——Q/TTM 共用同一條公式（見
// pitMetrics/efficiency/turnoverRatio/computeTurnoverRatioFamilyPit.ts 的編排邏輯），差別
// 只在呼叫端傳進來的是單季還是近四季加總的營業成本；分母固定用本季期末存貨（不平均不加總），
// 跟舊架構一致。
export const calculateInventoryTurnover = (operatingCost: bigint | null, inventory: bigint | null): AnnualizableCalcResult => {
  const value = operatingCost !== null && inventory !== null ? toRatio(operatingCost, inventory) : null;
  const quarterlyAnnualized = value !== null ? annualizeQuarterly(value) : null;
  const nullReason = value === null ? determineNullReason(operatingCost, inventory) : null;
  return { value, quarterlyAnnualized, nullReason };
};
