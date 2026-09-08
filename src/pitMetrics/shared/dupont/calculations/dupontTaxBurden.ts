import { determineNullReason, toPct, type CalcResult } from './shared';

// dupontTaxBurden = 淨利 ÷ 稅前淨利——五因子 Extended DuPont 把三因子的「淨利率」拆成
// 稅務負擔×利息負擔×EBIT利潤率的第一項。
export const calculateDupontTaxBurden = (netIncome: bigint | null, profitBeforeTax: bigint | null): CalcResult => {
  const value = netIncome !== null && profitBeforeTax !== null ? toPct(netIncome, profitBeforeTax) : null;
  const nullReason = value === null ? determineNullReason(netIncome, profitBeforeTax) : null;
  return { value, nullReason };
};
