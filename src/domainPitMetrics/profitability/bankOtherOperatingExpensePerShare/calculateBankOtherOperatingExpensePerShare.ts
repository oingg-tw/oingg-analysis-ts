import { determineNullReason, toPerShare, type CalcResult } from '@/domainPitMetrics/shared/numericHelpers';

// bankOtherOperatingExpensePerShare = 其他營業費用 ÷ 流通股數——Q/TTM 共用同一條公式。
// 「其他營業費用」本身沒有對應的官方單一總計欄位（銀行損益表底下營業費用科目太細碎，
// 逐項相加對不起來的風險已在 bankIncomeStatementXbrl.ts 檔頭記錄過一次真實案例），改用
// 殘差法算出（淨收益 − 呆帳費用及保證責任準備 − 稅前淨利），保證瀑布圖每一步加總正確，
// 見 computeBankIncomeWaterfallPit.ts 的殘差計算邏輯，這裡的 otherOperatingExpense
// 參數就是編排層算好的殘差金額，不是這個檔案自己重新查資料庫組裝。
export const calculateBankOtherOperatingExpensePerShare = (otherOperatingExpense: bigint | null, shares: bigint | null): CalcResult => {
  const value = otherOperatingExpense !== null && shares !== null ? toPerShare(otherOperatingExpense, shares) : null;
  const nullReason = value === null ? determineNullReason(otherOperatingExpense, shares) : null;
  return { value, nullReason };
};
