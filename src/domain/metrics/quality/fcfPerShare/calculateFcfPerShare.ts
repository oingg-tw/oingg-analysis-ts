import { determineNullReason, toPerShare, type CalcResult } from '@/domain/metrics/shared/numericHelpers';

// fcfPerShare = 自由現金流（見
// pitMetrics/quality/cashFlowPerShare/fcf.ts） ÷ 流通股數——Q/TTM 共用同一條公式（見
// pitMetrics/quality/cashFlowPerShare/computeCashFlowPerSharePit.ts 的編排邏輯）。
export const calculateFcfPerShare = (fcf: bigint | null, shares: bigint | null): CalcResult => {
  const value = fcf !== null && shares !== null ? toPerShare(fcf, shares) : null;
  const nullReason = value === null ? determineNullReason(fcf, shares) : null;
  return { value, nullReason };
};
