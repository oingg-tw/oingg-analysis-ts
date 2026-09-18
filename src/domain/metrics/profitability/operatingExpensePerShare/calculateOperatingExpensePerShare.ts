import { determineNullReason, toPerShare, type CalcResult } from '@/domain/metrics/shared/numericHelpers';

// operatingExpensePerShare = 營業費用合計 ÷ 流通股數——只有 TTM 一種 basis。直接讀損益表
// operating_expense 科目（推銷+管理+研發費用的合計小計，是真實揭露的單一科目，不是
// sellingExpenses+adminExpenses 自己加總），不是用 grossProfitPerShare − operatingIncomePerShare
// 反推——理由同 calculateGrossProfitPerShare.ts。2026-09-18 實測：~5% 公司「毛利−營業費用=
// 營業利益」對不上，差額幾乎精確等於損益表的 net_other_income_expenses（其他利益及損失淨額）
// 科目——真正的恆等式是「毛利−營業費用+其他利益及損失淨額＝營業利益」，這裡刻意不吸收那個
// 科目，operatingExpensePerShare 單純對應官方揭露的營業費用合計本身，見 definition 的完整說明。
export const calculateOperatingExpensePerShare = (operatingExpense: bigint | null, shares: bigint | null): CalcResult => {
  const value = operatingExpense !== null && shares !== null ? toPerShare(operatingExpense, shares) : null;
  const nullReason = value === null ? determineNullReason(operatingExpense, shares) : null;
  return { value, nullReason };
};
