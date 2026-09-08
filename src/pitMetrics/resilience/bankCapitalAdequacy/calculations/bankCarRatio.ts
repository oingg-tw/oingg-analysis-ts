import type { CalcResult } from './shared';

// bankCarRatio（總資本適足率）= 合格資本 ÷ 風險加權資產——這批唯一自己做除法的欄位，
// 其餘（CET1/Tier1）都是直接讀 mops-ts 已經算好的比率。
export const calculateBankCarRatio = (eligibleCapital: bigint | null | undefined, riskWeightedAssets: bigint | null | undefined): CalcResult => {
  const num = eligibleCapital ?? null;
  const denom = riskWeightedAssets ?? null;
  if (num === null || denom === null) return { value: null, nullReason: 'missing_input' };
  if (denom === 0n) return { value: null, nullReason: 'zero_or_negative_denominator' };
  const value = Math.round((Number(num) / Number(denom)) * 100 * 100) / 100;
  return { value, nullReason: null };
};
