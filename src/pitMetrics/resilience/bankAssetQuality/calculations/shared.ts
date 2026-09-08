import type { MetricNullReason } from '../../../metricBasis';

export interface CalcResult {
  value: number | null;
  nullReason: MetricNullReason | null;
}
