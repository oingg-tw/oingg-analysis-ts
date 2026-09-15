import { determineNullReason, toPerShare, type CalcResult } from '@/domainPitMetrics/shared/numericHelpers';

// depreciationAmortizationPerShare = (折舊費用 + 攤銷費用) ÷ 流通股數——Q/TTM 共用同一條
// 公式（見 pitMetrics/quality/cashFlowPerShare/computeCashFlowPerSharePit.ts 的編排邏輯），
// 折舊/攤銷來源欄位跟 evEbitda 算 EBITDA 時用的完全一致（cashFlowStatement.depreciation/
// amortization），不是另外新開的資料源。
export const calculateDepreciationAmortizationPerShare = (depreciationAndAmortization: bigint | null, shares: bigint | null): CalcResult => {
  const value = depreciationAndAmortization !== null && shares !== null ? toPerShare(depreciationAndAmortization, shares) : null;
  const nullReason = value === null ? determineNullReason(depreciationAndAmortization, shares) : null;
  return { value, nullReason };
};
