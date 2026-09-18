import { determineNullReason, toPerShare, type CalcResult } from '@/domain/metrics/shared/numericHelpers';

// operatingExpensePerShare = 營業費用合計 ÷ 流通股數——只有 TTM 一種 basis。直接讀損益表
// operating_expense 科目（推銷+管理+研發費用的合計小計，是真實揭露的單一科目，不是
// sellingExpenses+adminExpenses 自己加總），不是用 grossProfitPerShare − operatingIncomePerShare
// 反推——理由同 calculateGrossProfitPerShare.ts。2026-09-18 實測：多數公司這個科目跟
// 「毛利−營業費用=營業利益」吻合，但少數公司（~5%）損益表在這三個科目之外還有其他項目
// 落在營業利益區間內，這條鏈不保證每家公司都是嚴絲合縫的恆等式，是資料本身的限制，
// 不是這裡算錯。
export const calculateOperatingExpensePerShare = (operatingExpense: bigint | null, shares: bigint | null): CalcResult => {
  const value = operatingExpense !== null && shares !== null ? toPerShare(operatingExpense, shares) : null;
  const nullReason = value === null ? determineNullReason(operatingExpense, shares) : null;
  return { value, nullReason };
};
