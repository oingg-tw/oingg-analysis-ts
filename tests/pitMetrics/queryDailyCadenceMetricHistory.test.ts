import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { getDailyCadenceMetricHistory } from '@/application/metrics/shared/queryDailyCadenceMetricHistory';
import { analysisPrisma } from '@/infrastructure/prisma/analysisClient';
import { appDeps } from '@/bootstrap/deps';

// 2026-09-09 拆表要修的正是這個 bug 的 regression test：拆表前 getMetricHistory() 用
// `${fiscalYear}-${fiscalQuarter}` 當去重鍵，逐日型指標的 fiscalQuarter 固定是 sentinel
// 0，導致同一整年的所有交易日被壓成同一個 key，只留一筆——2330 的 beta（2Y/1W）DB 裡有
// 1,288 筆真實資料，拆表前這支查詢只會回傳 ~7 筆（一年一筆）。拆表後改用 tradeDate 當
// 去重鍵，這裡驗證回傳筆數遠大於 7，不是只靠手動 curl 驗證。

test('getDailyCadenceMetricHistory: 2330 beta 2Y/1W 應該回傳遠多於 7 筆（不是被 fiscalYear 誤判成一年一筆）', async () => {
  const result = await getDailyCadenceMetricHistory('2330', 'beta', { lookbackRange: '2Y', samplingInterval: '1W', snapshotCadence: 'N/A' }, '2', '', 40, appDeps);

  assert.ok(result.total > 100, `total 應該遠大於 7（一年一筆會壓成的假象），實際是 ${result.total}`);
  assert.equal(result.entries.length, 40, 'limit=40 應該回傳滿 40 筆');
  assert.ok(result.hasMore, 'total 遠大於 40，應該還有更多資料');

  for (const entry of result.entries) {
    assert.ok(entry.tradeDate, '逐日型指標的每一筆都應該帶 tradeDate');
    assert.equal(entry.fiscalQuarter, null, '逐日型指標的 fiscalQuarter 應該固定是 null，不是假的 sentinel 值');
  }

  // entries 應該是由舊到新排序，且每一筆的 tradeDate 都不同（不是同一天被重複列出）。
  const tradeDates = result.entries.map((e) => e.tradeDate);
  assert.equal(new Set(tradeDates).size, tradeDates.length, '不應該有重複的 tradeDate');
  assert.ok(tradeDates[0]! < tradeDates[tradeDates.length - 1]!, 'entries 應該由舊到新排序');
});

test('getDailyCadenceMetricHistory: 查無此公司時 entries 是空陣列、total=0、hasMore=false', async () => {
  const result = await getDailyCadenceMetricHistory('999999', 'beta', { lookbackRange: '2Y', samplingInterval: '1W', snapshotCadence: 'N/A' }, '2', '', 20, appDeps);
  assert.deepEqual(result.entries, []);
  assert.equal(result.total, 0);
  assert.equal(result.hasMore, false);
});

afterAll(async () => {
  await analysisPrisma.$disconnect();
});
