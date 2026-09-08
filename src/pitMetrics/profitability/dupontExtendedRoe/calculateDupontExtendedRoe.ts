import { round2, type CalcResult } from '@/pitMetrics/numericHelpers';

// dupontExtendedRoe = 五因子相乘（稅務負擔×利息負擔×EBIT利潤率×總資產週轉率×權益乘數）
// 的組裝結果，理論上等於 dupontDecomposedRoe（見
// pitMetrics/shared/dupont/computeDupontFamilyPit.ts 的編排邏輯）。taxBurdenPct/
// interestBurdenPct/ebitMarginPct 三個都已經是 *100 的百分比（不是原始比率），跟
// assetTurnover/equityMultiplier 這兩個原始比率相乘後，總共多乘了 100^2，最後除以 10000
// 校正回正確的百分比尺度——這是這批指標最容易踩的坑，已用 2330 115Q2 真實數字驗證過這個
// 公式算出來的結果精確等於 dupontDecomposedRoe。
export const calculateDupontExtendedRoe = (
  taxBurdenPct: number | null,
  interestBurdenPct: number | null,
  ebitMarginPct: number | null,
  assetTurnover: number | null,
  equityMultiplier: number | null,
): CalcResult => {
  const value =
    taxBurdenPct !== null && interestBurdenPct !== null && ebitMarginPct !== null && assetTurnover !== null && equityMultiplier !== null
      ? round2((taxBurdenPct * interestBurdenPct * ebitMarginPct * assetTurnover * equityMultiplier) / 10000)
      : null;
  const nullReason = value === null ? 'missing_input' : null;
  return { value, nullReason };
};
