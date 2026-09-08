import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { getMetricHistory } from '@/pitMetrics/queryMetricHistory';
import { periodTypeGroup } from '@/pitMetrics/metricValueWriter';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// 2026-09-07 使用者要求：total/hasMore 讓前端判斷要不要提供「看更長區間」的選項（例如
// 完整歷史只有 6 年就不該讓使用者點「近 10 年」）。2330 的 bvps（Q basis）已經 backfill
// 到 109Q4~115Q2 共 23 季（見 scripts/backfillPeRatioAndPbRatioPit.ts，2026-09-07 從
// 20 季再往前擴充 3 季緩衝），拿來驗證 total/hasMore 的行為。

test('getMetricHistory: limit 小於總期數時，entries 只回傳 limit 筆，total 是完整期數，hasMore=true', async () => {
  const result = await getMetricHistory('2330', 'bvps', periodTypeGroup('Q'), '2', '', 5);
  assert.equal(result.entries.length, 5, 'entries 應該只有 5 筆');
  assert.equal(result.total, 23, '2330 bvps 已知 backfill 到 23 季');
  assert.equal(result.hasMore, true, '23 > 5，應該還有更多資料');
});

test('getMetricHistory: limit 大於等於總期數時，entries 回傳全部，hasMore=false', async () => {
  const result = await getMetricHistory('2330', 'bvps', periodTypeGroup('Q'), '2', '', 40);
  assert.equal(result.entries.length, 23, '總共只有 23 季，limit=40 應該全部回傳');
  assert.equal(result.total, 23);
  assert.equal(result.hasMore, false, '23 <= 40，沒有更多資料了');
});

test('getMetricHistory: 查無任何資料時，total=0、hasMore=false、entries 是空陣列', async () => {
  const result = await getMetricHistory('999999', 'bvps', periodTypeGroup('Q'), '2', '', 20);
  assert.deepEqual(result.entries, []);
  assert.equal(result.total, 0);
  assert.equal(result.hasMore, false);
});

afterAll(async () => {
  await analysisPrisma.$disconnect();
});
