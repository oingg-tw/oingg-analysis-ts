import { determineNullReason, toPercent, type CalcResult } from '@/domain/metrics/shared/numericHelpers';

// cashRatio（現金比率）= 現金及約當現金 ÷ 流動負債——純資產負債表時點快照，只有 Q 一種
// basis（見 pitMetrics/resilience/liquidityRatio/computeLiquidityRatioPit.ts 的編排邏輯）。
export const calculateCashRatio = (cashAndEquivalents: bigint | null, currentLiabilities: bigint | null): CalcResult => {
  const value = cashAndEquivalents !== null && currentLiabilities !== null ? toPercent(cashAndEquivalents, currentLiabilities) : null;
  const nullReason = value === null ? determineNullReason(cashAndEquivalents, currentLiabilities) : null;
  return { value, nullReason };
};
