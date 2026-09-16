import type { LookbackRange, PeriodType, SamplingInterval, SnapshotCadence } from '@/domain/metrics/metricBasis';

// analysis DB 的 metric_values / metric_daily_cadence_values 讀取端 port（寫入端是 metricValues.ts 的
// MetricValueRepository，刻意分開：指標核心的 PitDeps 只需要寫入端 + findLatest，讀取端是 HTTP use case 在用，
// 分開讓 tests/fakes/pit 的記憶體版不用實作用不到的方法）。screener 的四種查詢之後併進來。實作在
// infrastructure/repositories/analysis/metricValueQueries.ts。
// value 刻意是 unknown：Prisma 回傳 Decimal 物件，Number() 在呼叫端做。

export interface PeriodHistoryRow {
  fiscalYear: number;
  fiscalQuarter: number;
  value: unknown;
  nullReason: string | null;
  knowledgeDate: Date;
  knowledgeDateIsFallback: boolean;
}

export interface DailyCadenceHistoryRow {
  tradeDate: Date;
  value: unknown;
  nullReason: string | null;
  knowledgeDate: Date;
  knowledgeDateIsFallback: boolean;
}

export interface DailyCadenceCoordinateGroup {
  lookbackRange: LookbackRange;
  samplingInterval: SamplingInterval;
  snapshotCadence: SnapshotCadence;
}

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
  // 單一 metricCode 的全部歷史列（含重編疊加的多筆），依 fiscalYear/fiscalQuarter 降冪、同座標再依 knowledgeDate 降冪——
  // 去重取最新一筆是 application/metrics/shared/queryMetricHistory.ts 的事。
  listPeriodMetricHistoryRows(symbol: string, metricCode: string, periodType: PeriodType, dataType: string, subsidiaryCompanyId: string): Promise<PeriodHistoryRow[]>;
  // 逐日型版本：依 tradeDate 降冪、同 tradeDate 再依 knowledgeDate 降冪。
  listDailyCadenceMetricHistoryRows(
    symbol: string,
    metricCode: string,
    coordinate: DailyCadenceCoordinateGroup,
    dataType: string,
    subsidiaryCompanyId: string
  ): Promise<DailyCadenceHistoryRow[]>;
}
