import { determineNullReason, toPercent, type CalcResult } from '@/domainPitMetrics/numericHelpers';

// bankCarRatio（總資本適足率）= 合格資本 ÷ 風險加權資產——這批唯一自己做除法的欄位，
// 其餘（CET1/Tier1）都是直接讀 mops-ts 已經算好的比率。
export const calculateBankCarRatio = (eligibleCapital: bigint | null | undefined, riskWeightedAssets: bigint | null | undefined): CalcResult => {
  const num = eligibleCapital ?? null;
  const denom = riskWeightedAssets ?? null;
  const value = num !== null && denom !== null ? toPercent(num, denom) : null;
  const nullReason = value === null ? determineNullReason(num, denom) : null;
  return { value, nullReason };
};
