import { determineNullReason, toPercent, type CalcResult } from '@/domain/metrics/shared/numericHelpers';

// dupontTaxBurden = 淨利 ÷ 稅前淨利——五因子 Extended DuPont 把三因子的「淨利率」拆成
// 稅務負擔×利息負擔×EBIT利潤率的第一項（見
// pitMetrics/shared/dupont/computeDupontFamilyPit.ts 的編排邏輯）。
export const calculateDupontTaxBurden = (netIncome: bigint | null, profitBeforeTax: bigint | null): CalcResult => {
  const value = netIncome !== null && profitBeforeTax !== null ? toPercent(netIncome, profitBeforeTax) : null;
  const nullReason = value === null ? determineNullReason(netIncome, profitBeforeTax) : null;
  return { value, nullReason };
};
