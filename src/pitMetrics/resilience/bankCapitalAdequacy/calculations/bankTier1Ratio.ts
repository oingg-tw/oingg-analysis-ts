import type { CalcResult } from './shared';

// bankTier1Ratio（第一類資本比率）——直接讀 mops-ts 已經算好的比率。
export const calculateBankTier1Ratio = (ratioTierICapitalToRwa: number | null | undefined): CalcResult => ({
  value: ratioTierICapitalToRwa ?? null,
  nullReason: ratioTierICapitalToRwa == null ? 'missing_input' : null,
});
