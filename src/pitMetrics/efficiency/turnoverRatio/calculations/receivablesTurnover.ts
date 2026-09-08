import { determineNullReason, toTurnover, round2, type TurnoverCalcResult } from './shared';

// receivablesTurnover = 營收 ÷ 應收帳款——Q/TTM 共用同一條公式，分母固定用本季期末應收帳款。
export const calculateReceivablesTurnover = (operatingRevenue: bigint | null, accountsReceivable: bigint | null): TurnoverCalcResult => {
  const value = operatingRevenue !== null && accountsReceivable !== null ? toTurnover(operatingRevenue, accountsReceivable) : null;
  const quarterlyAnnualized = value !== null ? round2(value * 4) : null;
  const nullReason = value === null ? determineNullReason(operatingRevenue, accountsReceivable) : null;
  return { value, quarterlyAnnualized, nullReason };
};
