import type { MetricNullReason } from '@/domainPitMetrics/metricBasis';
import { toDays, daysNullReason, type CalcResult } from '@/domainPitMetrics/shared/numericHelpers';

// inventoryDays（DIO）= 365 ÷ 存貨周轉率（TTM 版本，只有 TTM 一種 basis，見
// pitMetrics/efficiency/turnoverRatio/computeTurnoverRatioFamilyPit.ts 的編排邏輯）。
export const calculateInventoryDays = (turnover: number | null, turnoverNullReason: MetricNullReason | null): CalcResult => {
  const value = toDays(turnover);
  const nullReason = value === null ? daysNullReason(turnover, turnoverNullReason) : null;
  return { value, nullReason };
};
