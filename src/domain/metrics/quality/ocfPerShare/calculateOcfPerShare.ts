import { determineNullReason, toPerShare, type CalcResult } from '@/domain/metrics/shared/numericHelpers';

// ocfPerShare = 營業活動現金流 ÷ 流通股數——Q/TTM 共用同一條公式（見
// pitMetrics/quality/cashFlowPerShare/computeCashFlowPerSharePit.ts 的編排邏輯），差別只在
// 呼叫端傳進來的是單季還是近四季加總的現金流。
export const calculateOcfPerShare = (operatingCashFlow: bigint | null, shares: bigint | null): CalcResult => {
  const value = operatingCashFlow !== null && shares !== null ? toPerShare(operatingCashFlow, shares) : null;
  const nullReason = value === null ? determineNullReason(operatingCashFlow, shares) : null;
  return { value, nullReason };
};
