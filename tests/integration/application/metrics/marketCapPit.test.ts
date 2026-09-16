import { test, afterAll, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { computeAndWriteMarketCapPit } from '@/bootstrap/pitMetrics';
import { metricDefinitionRegistry } from '@/application/metrics/metricDefinitionRegistry';
import { upsertMetricDefinition } from '@/bootstrap/metricDefinitions';
import { mopsExportPrisma } from '@/infrastructure/prisma/mopsExportClient';
import { analysisPrisma } from '@/infrastructure/prisma/analysisClient';

beforeAll(async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.marketCap!);
});

test('marketCapPit: 2330 115Q2，跟收盤價 × 流通股數交叉驗證', async () => {
  await computeAndWriteMarketCapPit({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const q = await analysisPrisma.metricValue.findFirst({
    where: { symbol: '2330', metricCode: 'marketCap', periodType: 'Q', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' },
    orderBy: { knowledgeDate: 'desc' },
  });

  assert.ok(q, 'Q 應該寫入');
  // 2026-09-11 使用者要求保留 4 位有效數字（不是小數位數）——原始精確值
  // 62,108,026,310,465 四捨五入到 4 位有效數字是 62,110,000,000,000。
  assert.equal(Number(q!.value), 62110000000000);
});

test('marketCapPit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await computeAndWriteMarketCapPit({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.q, { action: 'skipped_no_quarter' });
  const count = await analysisPrisma.metricValue.count({ where: { symbol: '9999', metricCode: 'marketCap' } });
  assert.equal(count, 0);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
