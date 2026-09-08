import { determineNullReason, toTurnover, round2, type TurnoverCalcResult } from './shared';

// payablesTurnover = 營業成本 ÷ 應付帳款——Q/TTM 共用同一條公式，分母固定用本季期末應付帳款。
export const calculatePayablesTurnover = (operatingCost: bigint | null, accountsPayable: bigint | null): TurnoverCalcResult => {
  const value = operatingCost !== null && accountsPayable !== null ? toTurnover(operatingCost, accountsPayable) : null;
  const quarterlyAnnualized = value !== null ? round2(value * 4) : null;
  const nullReason = value === null ? determineNullReason(operatingCost, accountsPayable) : null;
  return { value, quarterlyAnnualized, nullReason };
};
