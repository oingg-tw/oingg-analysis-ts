import { getMetricHistory, metricHistoryEntrySchema, type MetricHistoryDeps, type MetricHistoryResult } from '../../shared/queryMetricHistory';
import type { PeriodType } from '../../../../domain/metrics/metricBasis';

// 比照 src/domainPitMetrics/profitability/roe/queryRoeHistory.ts 的薄包裝模式，重用通用的 getMetricHistory。
export const roaHistoryEntrySchema = metricHistoryEntrySchema;

// ROA 只落在季報型（periodType），理由同 queryRoeHistory.ts。
export const getRoaHistory = async (symbol: string, periodType: PeriodType, limit: number, deps: MetricHistoryDeps): Promise<MetricHistoryResult> =>
  getMetricHistory(symbol, 'roa', periodType, await deps.reportAvailability.resolveDataType(symbol), '', limit, deps);
