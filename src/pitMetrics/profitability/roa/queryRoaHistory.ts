import { getMetricHistory, metricHistoryEntrySchema, type MetricHistoryEntry, type MetricHistoryResult } from '../../queryMetricHistory';
import type { PeriodType } from '../../metricBasis';

// 比照 src/pitMetrics/profitability/roe/queryRoeHistory.ts 的薄包裝模式，重用通用的 getMetricHistory。
export const roaHistoryEntrySchema = metricHistoryEntrySchema;
export type RoaHistoryEntry = MetricHistoryEntry;

// ROA 只落在季報型（periodType），理由同 queryRoeHistory.ts。
export const getRoaHistory = (symbol: string, periodType: PeriodType, limit: number): Promise<MetricHistoryResult> =>
  getMetricHistory(symbol, 'roa', periodType, '2', '', limit);
