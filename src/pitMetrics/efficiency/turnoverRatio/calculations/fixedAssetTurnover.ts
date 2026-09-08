import { determineNullReason, toTurnover, round2, type TurnoverCalcResult } from './shared';

// fixedAssetTurnover = 營收 ÷ 不動產廠房及設備——Q/TTM 共用同一條公式，分母固定用本季期末餘額。
export const calculateFixedAssetTurnover = (operatingRevenue: bigint | null, propertyPlantEquipment: bigint | null): TurnoverCalcResult => {
  const value = operatingRevenue !== null && propertyPlantEquipment !== null ? toTurnover(operatingRevenue, propertyPlantEquipment) : null;
  const quarterlyAnnualized = value !== null ? round2(value * 4) : null;
  const nullReason = value === null ? determineNullReason(operatingRevenue, propertyPlantEquipment) : null;
  return { value, quarterlyAnnualized, nullReason };
};
