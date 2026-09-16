import type { SnapshotCadence } from '@/domain/metrics/metricBasis';

// analysis DB 的 metric_values / metric_daily_cadence_values 讀取端 port（寫入端是 metricValues.ts 的
// MetricValueRepository）。screener 的四種查詢之後併進來。實作在
// infrastructure/repositories/analysis/metricValueQueries.ts。
export interface MetricValueQueryPort {
  // 某支逐日型 snapshot 指標（exchangePeRatio/exchangePbRatio/dividendYield…）目前市場最後所知的一筆值。
  findLatestSnapshotValue(
    symbol: string,
    metricCode: string,
    snapshotCadence: SnapshotCadence,
    dataType: string,
    subsidiaryCompanyId: string
  ): Promise<{ tradeDate: Date; value: number | null } | null>;
  // 批次完整性檢查用：這批公司在時間窗內實際被寫入/更新的列數。
  countMetricRowsWrittenSince(metricCode: string, symbols: string[], since: Date, isDailyCadence: boolean): Promise<number>;
}
