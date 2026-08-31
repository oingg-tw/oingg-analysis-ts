// 數據中台同步協定的型別定義——對應「業務中台與後台資料邊界架構」契約第三部分（同步協定）。
// 這些型別刻意不綁死任何實際後台/資料庫，syncDataset.ts 的主邏輯只吃這些介面，方便用假資料
// 測試，也讓「換一個後台/換一個 dataset」只需要實作這幾個介面，不用碰主邏輯。

// 對應後台 export.ingestion_runs 一列。2026-08-31 用 mops-ts 的真實 export schema 驗證過：
// 顆粒度是「一個 dataset、一家公司、一季」，不是涵蓋多家公司的日批次（row_count 每筆都是 1）——
// listNewRuns 可能會一次拿回大量筆數，這是預期行為，不是設計錯誤。
export interface IngestionRun {
  runId: string;
  dataset: string;
  dataDate: string; // YYYY-MM-DD，這批資料的業務日期
  completedAt: Date; // 後台 ingestion 成功寫完的時間，point-in-time 查詢的依據
  rowCount: number; // 落地列數，供中台核對
  // 連接器專用、不透明的識別資訊（例如 mops 的 company_id/year/season），只有產生這個 run 的
  // 同一個 SourceConnector 自己看得懂、拿來在 fetchDatasetRows 裡重新查對應 view 的列——
  // syncDataset 主邏輯完全不解讀這個欄位，不同後台/dataset 塞什麼形狀都可以。
  sourceKey: unknown;
}

// 怎麼問一個後台拿新批次、怎麼從對應 view 拉資料——每個 (backend, dataset) 各自實作一份。
export interface SourceConnector<Row> {
  // 查 export.ingestion_runs WHERE completed_at > sinceWatermark AND status = 'success'。
  // sinceWatermark 是 null 代表第一次同步（還沒有任何 sync_state 紀錄），要拿全部。
  listNewRuns(sinceWatermark: Date | null): Promise<IngestionRun[]>;
  // 從對應 view 拉某個 run 的 dataDate 當天資料。
  fetchDatasetRows(run: IngestionRun): Promise<Row[]>;
}

// 把一批 row 寫進 curated 層——冪等 upsert（key 是「股票代號 + data_date + 來源」），
// 重跑同一批次不會產生重複列。
export interface SyncTarget<Row> {
  upsertRows(rows: Row[], run: IngestionRun): Promise<void>;
}

// watermark 存取——生產環境用 sync_state 表（見 prismaWatermarkStore.ts），測試用記憶體假實作。
export interface WatermarkStore {
  getWatermark(backend: string, dataset: string): Promise<Date | null>;
  setWatermark(backend: string, dataset: string, runId: string, completedAt: Date): Promise<void>;
}

export type SyncOutcomeStatus = 'synced' | 'row_count_mismatch' | 'failed';

export interface SyncOutcome {
  runId: string;
  status: SyncOutcomeStatus;
  rowCount: number;
  message?: string;
}

export interface SyncResult {
  backend: string;
  dataset: string;
  outcomes: SyncOutcome[];
  newWatermark: { runId: string; completedAt: Date } | null;
}
