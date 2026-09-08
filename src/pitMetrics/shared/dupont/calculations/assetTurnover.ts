import { determineNullReason, toRatio, round2, type CalcResult } from './shared';

export interface AssetTurnoverCalcResult extends CalcResult {
  quarterlyAnnualized: number | null;
}

// assetTurnover = 營收 ÷ 總資產——三因子杜邦拆解的第二項。分母固定沿用「本季期末總資產」
// （TTM 版本也不是加總四季總資產，是同一個總資產配近四季營收加總），quarterlyAnnualized
// 只在單季（Q）版本才有意義（乘 4 年化），呼叫端只在寫 Q_ANN basis 時才用這個欄位。
export const calculateAssetTurnover = (operatingRevenue: bigint | null, totalAssets: bigint | null): AssetTurnoverCalcResult => {
  const value = operatingRevenue !== null && totalAssets !== null ? toRatio(operatingRevenue, totalAssets) : null;
  const quarterlyAnnualized = value !== null ? round2(value * 4) : null;
  const nullReason = value === null ? determineNullReason(operatingRevenue, totalAssets) : null;
  return { value, quarterlyAnnualized, nullReason };
};
