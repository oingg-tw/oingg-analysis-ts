import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { getMultiMetricHistory } from '@/application/metrics/shared/queryMultiMetricHistory';
import { analysisPrisma } from '@/infrastructure/prisma/analysisClient';
import { appDeps } from '@/bootstrap/deps';

// 2026-09-07 使用者要「五年三率」（毛利率/營業利益率/淨利率）一次抓齊，新增泛化版
// 多指標歷史查詢。用 2330 已知的三率真實資料交叉驗證：115Q2 三個值分別是
// grossMargin=67.72、operatingMargin=60.34、netProfitMargin=55.62（跟
// tests/domainPitMetrics/marginsFamilyPit.test.ts / dupontFamilyPit.test.ts 已驗證過的
// 基準值一致）。

test('getMultiMetricHistory: 2330 三率(grossMargin/operatingMargin/netProfitMargin) 115Q2 應該精確等於各自單獨查詢的已知基準值', async () => {
  const result = await getMultiMetricHistory('2330', ['grossMargin', 'operatingMargin', 'netProfitMargin'], 'Q', '2', '', 3, appDeps);

  const q2 = result.entries.find((e) => e.fiscalYear === 2026 && e.fiscalQuarter === 2);
  assert.ok(q2, '應該有 115Q2（西元 2026Q2）這一期');
  assert.equal(q2!.values.grossMargin?.value, 67.72);
  assert.equal(q2!.values.operatingMargin?.value, 60.34);
  assert.equal(q2!.values.netProfitMargin?.value, 55.62);
  assert.equal(q2!.values.grossMargin?.nullReason, null);

  assert.equal(result.total, 23, '2330 三率已知 backfill 到 23 季');
  assert.equal(result.hasMore, true, '這次只 limit=3，23>3 應該還有更多');
});

test('getMultiMetricHistory: 同一期三個 metricCode 應該共用同一個 knowledgeDate（同一次 computeAndWriteMarginsFamilyPit/DupontFamilyPit 寫入）', async () => {
  const result = await getMultiMetricHistory('2330', ['grossMargin', 'operatingMargin', 'netProfitMargin'], 'Q', '2', '', 1, appDeps);
  const only = result.entries[0]!;
  const dates = [only.values.grossMargin?.knowledgeDate, only.values.operatingMargin?.knowledgeDate, only.values.netProfitMargin?.knowledgeDate];
  assert.equal(new Set(dates).size, 1, '三個 metricCode 的 knowledgeDate 應該完全一致');
});

test('getMultiMetricHistory: 查無此公司時 entries 是空陣列、total=0、hasMore=false', async () => {
  const result = await getMultiMetricHistory('999999', ['grossMargin', 'operatingMargin'], 'Q', '2', '', 5, appDeps);
  assert.deepEqual(result.entries, []);
  assert.equal(result.total, 0);
  assert.equal(result.hasMore, false);
});

afterAll(async () => {
  await analysisPrisma.$disconnect();
});
