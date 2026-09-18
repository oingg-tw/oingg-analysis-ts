import { determineNullReason, toPerShare, type CalcResult } from '@/domain/metrics/shared/numericHelpers';

// incomeTaxExpensePerShare = 所得稅費用 ÷ 流通股數——只有 TTM 一種 basis。直接讀損益表
// income_tax_expense_continuing_operations 科目（當期揭露數字，不含遞延調整重建），
// 刻意不用 pretaxIncomePerShare − eps 反推——两者不等價：eps 的淨利是歸屬母公司口徑
// （profit_loss_attributable_to_owners_of_parent），而稅前淨利−所得稅費用等於整體淨利
// （profit_loss，含少數股東權益），全市場實測超過半數公司（115Q2 為 1109/2057）當季有
// 非零少數股東權益，用減法會把少數股東權益的份額也算進「所得稅費用」裡，系統性偏高。
export const calculateIncomeTaxExpensePerShare = (incomeTaxExpense: bigint | null, shares: bigint | null): CalcResult => {
  const value = incomeTaxExpense !== null && shares !== null ? toPerShare(incomeTaxExpense, shares) : null;
  const nullReason = value === null ? determineNullReason(incomeTaxExpense, shares) : null;
  return { value, nullReason };
};
