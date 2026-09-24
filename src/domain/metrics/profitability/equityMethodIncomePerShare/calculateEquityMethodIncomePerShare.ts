import { determineNullReason, toPerShare, type CalcResult } from '@/domain/metrics/shared/numericHelpers';

// equityMethodIncomePerShare = 採用權益法認列之關聯企業及合資損益份額 ÷ 流通股數。
// 業外損益五分拆之一。覆蓋率約 41%——沒有關聯企業/合資的公司本來就不會有這個科目，
// null 不代表資料缺漏。
export const calculateEquityMethodIncomePerShare = (amount: bigint | null, shares: bigint | null): CalcResult => {
  const value = amount !== null && shares !== null ? toPerShare(amount, shares) : null;
  const nullReason = value === null ? determineNullReason(amount, shares) : null;
  return { value, nullReason };
};
