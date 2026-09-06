import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { checkJobCompleteness } from '@/api/batch/completenessCheck';
import { calculateRoe } from '@/domainMetrics/roe';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import type { IndicatorJob } from '@/api/batch/indicatorJob';

const roeJob: IndicatorJob = {
  name: 'roe',
  category: 'profitability',
  getCompanyIds: async () => [],
  run: (symbol) => calculateRoe({ symbol, dataType: '2', subsidiaryCompanyId: '' }),
};

test('completenessCheck: 剛寫入的一列，時間窗設在寫入之前，應該被算進 written', async () => {
  const batchStartedAt = new Date();
  await calculateRoe({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const result = await checkJobCompleteness(roeJob, ['2330'], batchStartedAt);

  assert.equal(result.attempted, 1);
  assert.equal(result.written, 1);
  assert.equal(result.coverageRatio, 1);
  assert.equal(result.skipped, undefined);
});

test('completenessCheck: 時間窗設在寫入之後，應該算不到（驗證真的有依時間篩選，不是無條件數總表列數）', async () => {
  await calculateRoe({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });
  const batchStartedAtInTheFuture = new Date(Date.now() + 60_000);

  const result = await checkJobCompleteness(roeJob, ['2330'], batchStartedAtInTheFuture);

  assert.equal(result.written, 0);
  assert.equal(result.coverageRatio, 0);
});

test('completenessCheck: filterCatalog 找不到的 metricKey，應該回傳 skipped 而不是 throw', async () => {
  const bogusJob: IndicatorJob = { ...roeJob, name: '__not_a_real_metric_key__' };

  const result = await checkJobCompleteness(bogusJob, ['2330'], new Date());

  assert.ok(result.skipped, 'metricKey 解析不出對應資料表時應該回傳 skipped 原因');
});

test('completenessCheck: 空的 companyIds 視為完整（沒有攻打對象，無所謂完整度）', async () => {
  const result = await checkJobCompleteness(roeJob, [], new Date());

  assert.equal(result.attempted, 0);
  assert.equal(result.written, 0);
  assert.equal(result.coverageRatio, 1);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
