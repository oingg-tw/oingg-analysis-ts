import type { IngestionRun, SourceConnector, SyncOutcome, SyncResult, SyncTarget, WatermarkStore } from './types';

// 數據中台同步協定主邏輯（契約第三部分）——純邏輯，不碰任何實際資料庫連線，靠注入的
// connector/target/watermarkStore 跟外界互動，方便用假實作測試（見
// tests/shared/sync/syncDataset.test.ts），也讓正式串接時只要換掉這三個實作，不用改這裡。
//
// 流程：
// 1. 讀 watermark，查後台有哪些 completedAt > watermark 且成功的新批次。
// 2. 依 completedAt 由舊到新依序處理（保證 watermark 單調遞增，不會跳過中間批次）。
// 3. 每批次：拉資料 → 核對列數 → 核對通過才 upsert → 記錄這批的 outcome。
// 4. 任何一批「列數不符」或「拉取/寫入失敗」，立刻停止處理後面的批次、watermark 停在最後一個
//    成功的批次——不是「這批失敗但後面繼續」，因為 watermark 必須是連續的，跳過中間批次會讓
//    之後永遠拿不到那批資料（見契約第三部分第 5、6 點：「不符就記錄警告並不推進 watermark」
//    「任何一步失敗，watermark 不動，下次自然重試」）。
export const syncDataset = async <Row>(
  backend: string,
  dataset: string,
  connector: SourceConnector<Row>,
  target: SyncTarget<Row>,
  watermarkStore: WatermarkStore
): Promise<SyncResult> => {
  const watermark = await watermarkStore.getWatermark(backend, dataset);
  const runs = await connector.listNewRuns(watermark);
  const sortedRuns = [...runs].sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());

  const outcomes: SyncOutcome[] = [];
  let newWatermark: { runId: string; completedAt: Date } | null = null;

  for (const run of sortedRuns) {
    const outcome = await processRun(run, connector, target);
    outcomes.push(outcome);

    if (outcome.status !== 'synced') break;
    newWatermark = { runId: run.runId, completedAt: run.completedAt };
  }

  if (newWatermark) {
    await watermarkStore.setWatermark(backend, dataset, newWatermark.runId, newWatermark.completedAt);
  }

  return { backend, dataset, outcomes, newWatermark };
};

const processRun = async <Row>(run: IngestionRun, connector: SourceConnector<Row>, target: SyncTarget<Row>): Promise<SyncOutcome> => {
  let rows: Row[];
  try {
    rows = await connector.fetchDatasetRows(run);
  } catch (error) {
    return { runId: run.runId, status: 'failed', rowCount: 0, message: `拉取資料失敗：${error instanceof Error ? error.message : String(error)}` };
  }

  if (rows.length !== run.rowCount) {
    return {
      runId: run.runId,
      status: 'row_count_mismatch',
      rowCount: rows.length,
      message: `預期 ${run.rowCount} 列，實際拉到 ${rows.length} 列`,
    };
  }

  try {
    await target.upsertRows(rows, run);
  } catch (error) {
    return { runId: run.runId, status: 'failed', rowCount: rows.length, message: `寫入 curated 層失敗：${error instanceof Error ? error.message : String(error)}` };
  }

  return { runId: run.runId, status: 'synced', rowCount: rows.length };
};
