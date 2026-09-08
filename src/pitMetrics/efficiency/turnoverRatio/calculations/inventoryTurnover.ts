import { determineNullReason, toTurnover, round2, type TurnoverCalcResult } from './shared';

// inventoryTurnover = 營業成本 ÷ 存貨——Q/TTM 共用同一條公式，差別只在呼叫端傳進來的是
// 單季還是近四季加總的營業成本；分母固定用本季期末存貨（不平均不加總），跟舊架構一致。
export const calculateInventoryTurnover = (operatingCost: bigint | null, inventory: bigint | null): TurnoverCalcResult => {
  const value = operatingCost !== null && inventory !== null ? toTurnover(operatingCost, inventory) : null;
  const quarterlyAnnualized = value !== null ? round2(value * 4) : null;
  const nullReason = value === null ? determineNullReason(operatingCost, inventory) : null;
  return { value, quarterlyAnnualized, nullReason };
};
