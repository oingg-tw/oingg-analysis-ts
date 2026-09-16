import type { MetricNullReason } from '@/domain/metrics/metricBasis';
import { toDays, daysNullReason, type CalcResult } from '@/domain/metrics/shared/numericHelpers';

// receivablesDays（DSO）= 365 ÷ 應收帳款周轉率（年化或 TTM 版本）。
export const calculateReceivablesDays = (turnover: number | null, turnoverNullReason: MetricNullReason | null): CalcResult => {
  const value = toDays(turnover);
  const nullReason = value === null ? daysNullReason(turnover, turnoverNullReason) : null;
  return { value, nullReason };
};
