import { getMetricHistory, metricHistoryEntrySchema, type MetricHistoryEntry, type MetricHistoryResult } from '../../queryMetricHistory';
import { periodTypeGroup } from '../../metricValueWriter';
import type { PeriodType } from '../../metricBasis';

// 比照 src/pitMetrics/profitability/roe/queryRoeHistory.ts 的薄包裝模式，重用通用的 getMetricHistory。
export const roaHistoryEntrySchema = metricHistoryEntrySchema;
export type RoaHistoryEntry = MetricHistoryEntry;

// ROA 只落在 periodType 這一組（Q/Q_ANN/TTM），理由同 queryRoeHistory.ts。
export const getRoaHistory = (symbol: string, periodType: PeriodType, limit: number): Promise<MetricHistoryResult> =>
  getMetricHistory(symbol, 'roa', periodTypeGroup(periodType), '2', '', limit);
