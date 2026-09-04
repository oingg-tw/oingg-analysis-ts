import type { MetricStatus } from '@/shared/metricStatus';

export interface GovBondYield10yResult {
  yieldPct: number | null; // 百分比，例如 1.9 代表 1.9%
  asOfMonth: string | null; // "YYYY-MM"，查無資料時是 null
  fieldStatuses: Record<string, MetricStatus>;
  warnings: string[];
}
