import { determineNullReason, toPerShare, type CalcResult } from '@/domainPitMetrics/shared/numericHelpers';

// bankBadDebtProvisionPerShare = 呆帳費用及保證責任準備 ÷ 流通股數——Q/TTM 共用同一條
// 公式（見 pitMetrics/profitability/bankIncomeWaterfall/computeBankIncomeWaterfallPit.ts
// 的編排邏輯）。這是官方單一總計欄位（不拆子項，見該檔案檔頭的說明），是瀑布圖裡的
// 扣減項，正值代表費用支出（跟現金流量表 capex 慣例不同，這裡是損益表費用科目，直接
// 是正的費用金額，UI 呈現扣減時自己轉負號即可，不需要在這裡先轉負）。
export const calculateBankBadDebtProvisionPerShare = (badDebtProvision: bigint | null, shares: bigint | null): CalcResult => {
  const value = badDebtProvision !== null && shares !== null ? toPerShare(badDebtProvision, shares) : null;
  const nullReason = value === null ? determineNullReason(badDebtProvision, shares) : null;
  return { value, nullReason };
};
