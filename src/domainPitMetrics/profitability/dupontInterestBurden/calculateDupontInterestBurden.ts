import { determineNullReason, toPercent, type CalcResult } from '@/domainPitMetrics/shared/numericHelpers';

// dupontInterestBurden = 稅前淨利 ÷ EBIT——五因子 Extended DuPont 的第二項（見
// pitMetrics/shared/dupont/computeDupontFamilyPit.ts 的編排邏輯；EBIT 中繼值算法見
// pitMetrics/shared/dupont/ebit.ts）。
export const calculateDupontInterestBurden = (profitBeforeTax: bigint | null, ebit: bigint | null): CalcResult => {
  const value = profitBeforeTax !== null && ebit !== null ? toPercent(profitBeforeTax, ebit) : null;
  const nullReason = value === null ? determineNullReason(profitBeforeTax, ebit) : null;
  return { value, nullReason };
};
