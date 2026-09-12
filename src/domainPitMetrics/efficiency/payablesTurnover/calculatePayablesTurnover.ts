import { determineNullReason, toRatio, annualizeQuarterly, type AnnualizableCalcResult } from '@/domainPitMetrics/shared/numericHelpers';

// payablesTurnover = 營業成本 ÷ 應付帳款——Q/TTM 共用同一條公式（見
// pitMetrics/efficiency/turnoverRatio/computeTurnoverRatioFamilyPit.ts 的編排邏輯），
// 分母固定用本季期末應付帳款。
export const calculatePayablesTurnover = (operatingCost: bigint | null, accountsPayable: bigint | null): AnnualizableCalcResult => {
  const value = operatingCost !== null && accountsPayable !== null ? toRatio(operatingCost, accountsPayable) : null;
  const quarterlyAnnualized = value !== null ? annualizeQuarterly(value) : null;
  const nullReason = value === null ? determineNullReason(operatingCost, accountsPayable) : null;
  return { value, quarterlyAnnualized, nullReason };
};
