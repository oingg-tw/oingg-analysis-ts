import { getMetricHistory, metricHistoryEntrySchema, type MetricHistoryEntry, type MetricHistoryResult } from '../../queryMetricHistory';
import type { MetricBasis } from '../../metricBasis';

// 比照 src/pitMetrics/profitability/roe/queryRoeHistory.ts 的薄包裝模式，重用通用的 getMetricHistory。
export const roaHistoryEntrySchema = metricHistoryEntrySchema;
export type RoaHistoryEntry = MetricHistoryEntry;

export const getRoaHistory = (symbol: string, basis: MetricBasis, limit: number): Promise<MetricHistoryResult> =>
  getMetricHistory(symbol, 'roa', basis, '2', '', limit);
