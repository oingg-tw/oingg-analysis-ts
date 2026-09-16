import { determineNullReason, toRatio, type CalcResult } from '@/domain/metrics/shared/numericHelpers';

// fixedAssetTurnover = 營收 ÷ 不動產廠房及設備——Q/TTM 共用同一條公式（見
// pitMetrics/efficiency/turnoverRatio/computeTurnoverRatioFamilyPit.ts 的編排邏輯），
// 分母固定用本季期末餘額。
export const calculateFixedAssetTurnover = (operatingRevenue: bigint | null, propertyPlantEquipment: bigint | null): CalcResult => {
  const value = operatingRevenue !== null && propertyPlantEquipment !== null ? toRatio(operatingRevenue, propertyPlantEquipment) : null;
  const nullReason = value === null ? determineNullReason(operatingRevenue, propertyPlantEquipment) : null;
  return { value, nullReason };
};
