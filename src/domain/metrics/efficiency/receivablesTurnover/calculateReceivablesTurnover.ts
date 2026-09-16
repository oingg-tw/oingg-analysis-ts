import { determineNullReason, toRatio, type CalcResult } from '@/domain/metrics/shared/numericHelpers';

// receivablesTurnover = 營收 ÷ 應收帳款——Q/TTM 共用同一條公式（見
// pitMetrics/efficiency/turnoverRatio/computeTurnoverRatioFamilyPit.ts 的編排邏輯），
// 分母固定用本季期末應收帳款。
export const calculateReceivablesTurnover = (operatingRevenue: bigint | null, accountsReceivable: bigint | null): CalcResult => {
  const value = operatingRevenue !== null && accountsReceivable !== null ? toRatio(operatingRevenue, accountsReceivable) : null;
  const nullReason = value === null ? determineNullReason(operatingRevenue, accountsReceivable) : null;
  return { value, nullReason };
};
