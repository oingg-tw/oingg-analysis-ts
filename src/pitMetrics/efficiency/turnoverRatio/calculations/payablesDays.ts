import type { MetricNullReason } from '../../../metricBasis';
import { toDays, daysNullReason, type CalcResult } from './shared';

// payablesDays（DPO）= 365 ÷ 應付帳款周轉率（年化或 TTM 版本）。
export const calculatePayablesDays = (turnover: number | null, turnoverNullReason: MetricNullReason | null): CalcResult => {
  const value = toDays(turnover);
  const nullReason = value === null ? daysNullReason(turnover, turnoverNullReason) : null;
  return { value, nullReason };
};
