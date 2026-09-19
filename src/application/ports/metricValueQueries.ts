import type { LookbackRange, PeriodType, SamplingInterval, SnapshotCadence } from '@/domain/metrics/metricBasis';
import type { FieldRef } from '@/domain/metrics/timeframe';
import type { DistributionBucket } from '@/domain/shared/distribution';

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

// ---- screener 的四種查詢（POST /screener、GET /screener/ranking、GET /screener/company-rank、POST /screener/values）。
// SQL 組裝（CTE 去重、INNER/LEFT JOIN 語意、RANK() window）是 infrastructure 的知識，application 只拿到
// 已執行完的列：每個 field 依 index 對應 v{i}/k{i}/n{i} 三欄（value/knowledge_date/null_reason），
// 解析回 ScreenerValue 在 application/screener/service.ts。
export interface ScreenerFilterCondition extends FieldRef {
  min: number | null;
  max: number | null;
  exclude: boolean;
}

export interface ScreenerSortSpec {
  field: string; // "symbol" 或 columns 裡其中一個 field 字串——service 已經驗證過存在，repository 直接信任
  order: 'asc' | 'desc';
}

export interface ScreenerIndexedField extends FieldRef {
  index: number;
}

export interface CompanyRankRow {
  symbol: string;
  value: unknown;
  rank: bigint;
  quintile: bigint;
  total_count: bigint;
}

// 全市場某個欄位的分布（給「殖利率市場排名」卡片展開的直方圖用）——trueMin/trueMax 是實際
// 最小/最大值，clippedMin/clippedMax 是拿來切 bins 的裁切邊界（第 1/99 百分位，避免極端值
// 把其餘資料壓成一根柱子），bins 的 count 加總永遠等於 totalCount（離群值視覺上落進最左/
// 最右一格，不會憑空消失，見 domain/shared/distribution.ts 的說明）。totalCount=0（這個
// 欄位全市場都查無資料）時 trueMin/trueMax/clippedMin/clippedMax 皆為 null、bins 是空陣列。
export interface FieldDistribution {
  totalCount: number;
  trueMin: number | null;
  trueMax: number | null;
  clippedMin: number | null;
  clippedMax: number | null;
  bins: DistributionBucket[];
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
  // 篩選：每列 symbol + 每個 column 的 v/k/n 三欄 + total_count（COUNT(*) OVER()）；candidateSymbols=null 代表不限類股。
  screen(filters: ScreenerFilterCondition[], columns: FieldRef[], page: number, pageSize: number, sort: ScreenerSortSpec | null, candidateSymbols: string[] | null): Promise<Record<string, unknown>[]>;
  // 排行：排序欄位永遠是 index 0，其餘 columns 接在後面。
  rank(rankedField: FieldRef, direction: 'asc' | 'desc', limit: number, columns: FieldRef[], candidateSymbols: string[] | null): Promise<Record<string, unknown>[]>;
  // 單一公司在全市場某欄位的名次（RANK()，並列共用名次）；查無資料回空陣列。excludeZero 同
  // distribution() 的判斷條件（排除精確等於 0 的列，例如殖利率的「不配息」，不影響非 0 語意的欄位）。
  companyRank(symbol: string, field: FieldRef, direction: 'asc' | 'desc', excludeZero: boolean): Promise<CompanyRankRow[]>;
  // 明確列出的 symbol 各自的欄位值，每個 symbol 都保證有一列。
  values(symbols: string[], columns: FieldRef[]): Promise<Record<string, unknown>[]>;
  // 全市場某個欄位的分布（直方圖用），bins 是要切幾格；excludeZero 排除值精確等於 0 的列
  // （例如殖利率的「不配息」），見 infrastructure/repositories/analysis/screenerQueries.ts
  // buildValueFilter 的說明。
  distribution(field: FieldRef, bins: number, excludeZero: boolean): Promise<FieldDistribution>;
}
