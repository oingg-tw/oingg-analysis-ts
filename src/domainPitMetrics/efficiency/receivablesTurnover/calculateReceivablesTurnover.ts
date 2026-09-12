import { determineNullReason, toRatio, annualizeQuarterly, type AnnualizableCalcResult } from '@/domainPitMetrics/shared/numericHelpers';

// receivablesTurnover = 營收 ÷ 應收帳款——Q/TTM 共用同一條公式（見
// pitMetrics/efficiency/turnoverRatio/computeTurnoverRatioFamilyPit.ts 的編排邏輯），
// 分母固定用本季期末應收帳款。
export const calculateReceivablesTurnover = (operatingRevenue: bigint | null, accountsReceivable: bigint | null): AnnualizableCalcResult => {
  const value = operatingRevenue !== null && accountsReceivable !== null ? toRatio(operatingRevenue, accountsReceivable) : null;
  const quarterlyAnnualized = value !== null ? annualizeQuarterly(value) : null;
  const nullReason = value === null ? determineNullReason(operatingRevenue, accountsReceivable) : null;
  return { value, quarterlyAnnualized, nullReason };
};
