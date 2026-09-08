import type { CalcResult } from '@/pitMetrics/numericHelpers';

// bankCet1Ratio（普通股權益第一類資本比率）——直接讀 mops-ts 已經算好的比率。
export const calculateBankCet1Ratio = (ratioOrdinaryShareEquityToRwa: number | null | undefined): CalcResult => ({
  value: ratioOrdinaryShareEquityToRwa ?? null,
  nullReason: ratioOrdinaryShareEquityToRwa == null ? 'missing_input' : null,
});
