import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { checkJobCompleteness } from '@/api/batch/completenessCheck';
import { calculateBeta } from '@/domainMetrics/beta';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { twseExportPrisma } from '@/adapters/prisma/twseExportClient';
import type { IndicatorJob } from '@/api/batch/indicatorJob';

// 2026-09-07：使用者要求把舊架構「單一指標一張表」的 34 張 Result 表整批 DROP，原本這裡用
// 的 roe（RoeResult）已經不存在了，改用倖存的 beta（BetaResult）——這支測試在驗證
// checkJobCompleteness 本身的邏輯，不是在驗證任何一支指標的公式，換哪個 model 當範例不重要。

const betaJob: IndicatorJob = {
  name: 'beta',
  category: 'portfolio',
  getCompanyIds: async () => [],
  run: (symbol) => calculateBeta({ symbol }),
};

test('completenessCheck: 剛寫入的一列，時間窗設在寫入之前，應該被算進 written', async () => {
  const batchStartedAt = new Date();
  await calculateBeta({ symbol: '2330' });

  const result = await checkJobCompleteness(betaJob, ['2330'], batchStartedAt);

  assert.equal(result.attempted, 1);
  assert.equal(result.written, 1);
  assert.equal(result.coverageRatio, 1);
  assert.equal(result.skipped, undefined);
});

test('completenessCheck: 時間窗設在寫入之後，應該算不到（驗證真的有依時間篩選，不是無條件數總表列數）', async () => {
  await calculateBeta({ symbol: '2330' });
  const batchStartedAtInTheFuture = new Date(Date.now() + 60_000);

  const result = await checkJobCompleteness(betaJob, ['2330'], batchStartedAtInTheFuture);

  assert.equal(result.written, 0);
  assert.equal(result.coverageRatio, 0);
});

test('completenessCheck: filterCatalog 找不到的 metricKey，應該回傳 skipped 而不是 throw', async () => {
  const bogusJob: IndicatorJob = { ...betaJob, name: '__not_a_real_metric_key__' };

  const result = await checkJobCompleteness(bogusJob, ['2330'], new Date());

  assert.ok(result.skipped, 'metricKey 解析不出對應資料表時應該回傳 skipped 原因');
});

test('completenessCheck: 空的 companyIds 視為完整（沒有攻打對象，無所謂完整度）', async () => {
  const result = await checkJobCompleteness(betaJob, [], new Date());

  assert.equal(result.attempted, 0);
  assert.equal(result.written, 0);
  assert.equal(result.coverageRatio, 1);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
  await twseExportPrisma.$disconnect();
});
