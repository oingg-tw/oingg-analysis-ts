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

// 2026-09-23 月頻指標（第一支是 sus）的座標——獨立的 metric_monthly_values 表，理由見 schema.prisma 的
// MetricMonthlyValue 檔頭：季表沒有月份欄位（同一季三個月會撞座標）、逐日表的鍵叫 tradeDate 而且假設
// 「沒有公告延遲」，但月營收次月才公告。沒有 periodType 這類 discriminator——這張表只有一種座標形狀。
export interface MonthlyCoordinateWhere {
  symbol: string;
  metricCode: string;
  fiscalYear: number;
  fiscalMonth: number; // 1~12，真實值，沒有 sentinel
  dataType: string;
  subsidiaryCompanyId: string;
}

export interface ExistingMetricRow {
  value: unknown;
  nullReason: string | null;
  knowledgeDate: Date;
  // 2026-09-22 加進比對：公式改版後值剛好沒變的列（例如四捨五入吃掉差異）原本會停在舊的 formula_version，
  // 同一支指標的列會混著 v1/v2，之後查「這批重算過了嗎」會誤判。見 persistComputations.decideWrite。
  formulaVersion: number;
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
  findLatestMonthlyRow(where: MonthlyCoordinateWhere): Promise<ExistingMetricRow | null>;
  upsertMonthlyRow(where: MonthlyCoordinateWhere, values: MetricRowValues): Promise<void>;
}
