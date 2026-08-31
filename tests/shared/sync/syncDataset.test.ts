import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { syncDataset } from '@/shared/sync/syncDataset';
import type { IngestionRun, SourceConnector, SyncTarget, WatermarkStore } from '@/shared/sync/types';

interface FakeRow {
  id: string;
}

const makeRun = (overrides: Partial<IngestionRun> = {}): IngestionRun => ({
  runId: 'run-1',
  dataset: 'fake_dataset',
  dataDate: '2026-08-31',
  completedAt: new Date('2026-08-31T00:00:00Z'),
  rowCount: 1,
  sourceKey: null,
  ...overrides,
});

const makeFakeWatermarkStore = (initial: Date | null = null): WatermarkStore & { current: Date | null; runId: string | null } => {
  const state = { current: initial, runId: null as string | null };
  return {
    get current() {
      return state.current;
    },
    get runId() {
      return state.runId;
    },
    getWatermark: async () => state.current,
    setWatermark: async (_backend, _dataset, runId, completedAt) => {
      state.current = completedAt;
      state.runId = runId;
    },
  };
};

describe('syncDataset', () => {
  test('正常同步：批次全部成功，watermark 推進到最後一批的 completedAt', async () => {
    const runs = [makeRun({ runId: 'run-1', completedAt: new Date('2026-08-30T00:00:00Z'), rowCount: 2 }), makeRun({ runId: 'run-2', completedAt: new Date('2026-08-31T00:00:00Z'), rowCount: 1 })];
    const connector: SourceConnector<FakeRow> = {
      listNewRuns: async () => runs,
      fetchDatasetRows: async (run) => (run.runId === 'run-1' ? [{ id: 'a' }, { id: 'b' }] : [{ id: 'c' }]),
    };
    const written: FakeRow[] = [];
    const target: SyncTarget<FakeRow> = {
      upsertRows: async (rows) => {
        written.push(...rows);
      },
    };
    const watermarkStore = makeFakeWatermarkStore();

    const result = await syncDataset('fake', 'fake_dataset', connector, target, watermarkStore);

    assert.equal(result.outcomes.length, 2);
    assert.deepEqual(
      result.outcomes.map((o) => o.status),
      ['synced', 'synced']
    );
    assert.equal(written.length, 3);
    assert.equal(watermarkStore.runId, 'run-2');
    assert.equal(watermarkStore.current?.toISOString(), '2026-08-31T00:00:00.000Z');
  });

  test('列數不符時：不寫入、watermark 停在上一批成功的地方，不繼續處理後面的批次', async () => {
    const runs = [makeRun({ runId: 'run-1', completedAt: new Date('2026-08-30T00:00:00Z'), rowCount: 1 }), makeRun({ runId: 'run-2', completedAt: new Date('2026-08-31T00:00:00Z'), rowCount: 5 }), makeRun({ runId: 'run-3', completedAt: new Date('2026-09-01T00:00:00Z'), rowCount: 1 })];
    const connector: SourceConnector<FakeRow> = {
      listNewRuns: async () => runs,
      // run-2 宣稱有 5 列，實際只拉到 1 列——列數不符。
      fetchDatasetRows: async (run) => (run.runId === 'run-2' ? [{ id: 'x' }] : [{ id: 'ok' }]),
    };
    const written: FakeRow[] = [];
    const target: SyncTarget<FakeRow> = {
      upsertRows: async (rows) => {
        written.push(...rows);
      },
    };
    const watermarkStore = makeFakeWatermarkStore();

    const result = await syncDataset('fake', 'fake_dataset', connector, target, watermarkStore);

    assert.deepEqual(
      result.outcomes.map((o) => o.status),
      ['synced', 'row_count_mismatch']
    );
    // run-3（在 run-2 之後）完全沒被處理到——watermark 必須連續，不能跳過中間失敗的批次。
    assert.equal(result.outcomes.length, 2);
    assert.equal(written.length, 1); // 只有 run-1 的那一列寫入
    assert.equal(watermarkStore.runId, 'run-1'); // 停在 run-1，run-2/run-3 下次重試
  });

  test('寫入失敗時：watermark 不動，之後重試同一批次', async () => {
    const runs = [makeRun({ runId: 'run-1', completedAt: new Date('2026-08-31T00:00:00Z'), rowCount: 1 })];
    const connector: SourceConnector<FakeRow> = {
      listNewRuns: async () => runs,
      fetchDatasetRows: async () => [{ id: 'a' }],
    };
    const target: SyncTarget<FakeRow> = {
      upsertRows: async () => {
        throw new Error('DB 連線炸了');
      },
    };
    const watermarkStore = makeFakeWatermarkStore(new Date('2026-08-01T00:00:00Z'));

    const result = await syncDataset('fake', 'fake_dataset', connector, target, watermarkStore);

    assert.equal(result.outcomes[0]!.status, 'failed');
    assert.match(result.outcomes[0]!.message!, /DB 連線炸了/);
    assert.equal(result.newWatermark, null);
    // watermark 維持原本的值，沒有被清掉或推進。
    assert.equal(watermarkStore.current?.toISOString(), '2026-08-01T00:00:00.000Z');
  });

  test('重跑同一批次：因為是冪等 upsert，target 收到的還是同一批 rows，不會產生重複邏輯上的列', async () => {
    const run = makeRun({ runId: 'run-1', rowCount: 1 });
    const connector: SourceConnector<FakeRow> = {
      listNewRuns: async () => [run],
      fetchDatasetRows: async () => [{ id: 'a' }],
    };
    const upsertCalls: FakeRow[][] = [];
    const target: SyncTarget<FakeRow> = {
      upsertRows: async (rows) => {
        upsertCalls.push(rows);
      },
    };
    const watermarkStore = makeFakeWatermarkStore();

    await syncDataset('fake', 'fake_dataset', connector, target, watermarkStore);
    // 模擬「watermark 還沒推進就重跑」的情境（例如上次寫入成功但更新 watermark 前掛掉）——
    // 因為 target.upsertRows 是冪等的，重跑一次結果應該一樣，不會累加。
    await syncDataset('fake', 'fake_dataset', connector, target, watermarkStore);

    assert.equal(upsertCalls.length, 2);
    assert.deepEqual(upsertCalls[0], upsertCalls[1]);
  });
});
