import { determineNullReason, toPct, type CalcResult } from './shared';

// dupontEbitMargin = EBIT ÷ 營收——五因子 Extended DuPont 的第三項。注意這個「利潤率」
// 不等於既有 marginsFamily 的 operatingMargin（後者嚴格排除所有非營業損益，前者只加回財務
// 費用，非營業損益還留在裡面），兩個數字不一樣，這批 metric_code 全部加 dupont 前綴避免混淆。
export const calculateDupontEbitMargin = (ebit: bigint | null, operatingRevenue: bigint | null): CalcResult => {
  const value = ebit !== null && operatingRevenue !== null ? toPct(ebit, operatingRevenue) : null;
  const nullReason = value === null ? determineNullReason(ebit, operatingRevenue) : null;
  return { value, nullReason };
};
