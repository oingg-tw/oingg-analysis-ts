import type { CalcResult } from '@/domainPitMetrics/numericHelpers';

// bankNplCoverageRatio（備抵呆帳覆蓋率）——同 bankNplRatio，直接讀 mops-ts 已經算好的比率。
export const calculateBankNplCoverageRatio = (coverageRatio: number | null | undefined): CalcResult => ({
  value: coverageRatio ?? null,
  nullReason: coverageRatio == null ? 'missing_input' : null,
});
