import type { LookbackRange, PeriodType, SamplingInterval, SnapshotCadence } from '@/domain/metrics/metricBasis';

// metric_values（季報型）/ metric_daily_cadence_values（逐日型）的讀寫 port——「拿既有列比對、決定
// 要不要寫」的決策在 application/metrics/persistComputations.ts，這裡只有查最新一列跟原子 upsert
// 兩個原語。實作在 infrastructure/repositories/analysis/metricValueRepository.ts（Prisma），
// tests/fakes/pit/inMemoryMetricValues.ts 是給單元測試用的記憶體版。
// value 刻意是 unknown：Prisma 回傳 Decimal 物件、記憶體版回傳 number，轉換（Number()）在呼叫端做。

export interface PeriodCoordinateWhere {
  symbol: string;
  metricCode: string;
  periodType: PeriodType;
  fiscalYear: number;
  fiscalQuarter: number;
  dataType: string;
  subsidiaryCompanyId: string;
}

export interface DailyCadenceCoordinateWhere {
  symbol: string;
  metricCode: string;
  lookbackRange: LookbackRange;
  samplingInterval: SamplingInterval;
  snapshotCadence: SnapshotCadence;
  dataType: string;
  subsidiaryCompanyId: string;
  tradeDate: Date;
}

export interface ExistingMetricRow {
  value: unknown;
  nullReason: string | null;
  knowledgeDate: Date;
}

export interface MetricRowValues {
  value: number | null;
  nullReason: string | null;
  knowledgeDate: Date;
  knowledgeDateIsFallback: boolean;
  formulaVersion: number;
}

export interface MetricValueRepository {
  // 用「座標」（不含 knowledgeDate）查最新一列（knowledgeDate 降冪）——「目前市場最後所知」的那一列。
  findLatestPeriodRow(where: PeriodCoordinateWhere): Promise<ExistingMetricRow | null>;
  // 一次原子的 upsert，鍵是完整的 identity 唯一鍵（座標 + knowledgeDate）。
  upsertPeriodRow(where: PeriodCoordinateWhere, values: MetricRowValues): Promise<void>;
  findLatestDailyCadenceRow(where: DailyCadenceCoordinateWhere): Promise<ExistingMetricRow | null>;
  upsertDailyCadenceRow(where: DailyCadenceCoordinateWhere, values: MetricRowValues): Promise<void>;
}
