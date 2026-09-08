import { round2, type CalcResult } from './shared';

// dupontDecomposedRoe = 淨利率(%) × 總資產週轉率 × 權益乘數——三因子杜邦拆解的組裝結果，理論上
// 等於直接算出來的 ROE。三個因子任一為 null，不管原因為何，一律回報 missing_input——各因子
// 自己缺漏的細節記在各自的 metric_value 列上，查歷史時可以自己對照，這裡不重複細分。
export const calculateDupontDecomposedRoe = (netProfitMarginPct: number | null, assetTurnover: number | null, equityMultiplier: number | null): CalcResult => {
  const value = netProfitMarginPct !== null && assetTurnover !== null && equityMultiplier !== null ? round2(netProfitMarginPct * assetTurnover * equityMultiplier) : null;
  const nullReason = value === null ? 'missing_input' : null;
  return { value, nullReason };
};
