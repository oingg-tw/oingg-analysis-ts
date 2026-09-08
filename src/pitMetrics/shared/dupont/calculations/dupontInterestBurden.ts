import { determineNullReason, toPct, type CalcResult } from './shared';

// dupontInterestBurden = 稅前淨利 ÷ EBIT——五因子 Extended DuPont 的第二項。
export const calculateDupontInterestBurden = (profitBeforeTax: bigint | null, ebit: bigint | null): CalcResult => {
  const value = profitBeforeTax !== null && ebit !== null ? toPct(profitBeforeTax, ebit) : null;
  const nullReason = value === null ? determineNullReason(profitBeforeTax, ebit) : null;
  return { value, nullReason };
};
