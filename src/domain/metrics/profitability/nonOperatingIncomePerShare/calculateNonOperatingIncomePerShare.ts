import { determineNullReason, toPerShare, type CalcResult } from '@/domain/metrics/shared/numericHelpers';

// nonOperatingIncomePerShare = 業外損益 = 稅前淨利 − 營業利益 ÷ 流通股數。
// 刻意用「稅前淨利 − 營業利益」相減，而不是讀 XBRL 現成的 nonoperating_income_and_expenses 科目——
// 這跟本家族其他欄位「直接讀科目、不要相減」的慣例相反，理由是實測出來的：112 年起 27,147 列裡，
// 兩者同時有值的 24,471 列**全部相等**（0 例外），但有 140 列是科目為 null、相減卻算得出來，
// 反過來一列都沒有。也就是相減嚴格涵蓋讀科目。相減在這裡也沒有捨入誤差問題——兩個運算元都是
// 千元 bigint 原始金額，相減後才除以股數，只捨入一次。
export const calculateNonOperatingIncomePerShare = (amount: bigint | null, shares: bigint | null): CalcResult => {
  const value = amount !== null && shares !== null ? toPerShare(amount, shares) : null;
  const nullReason = value === null ? determineNullReason(amount, shares) : null;
  return { value, nullReason };
};
