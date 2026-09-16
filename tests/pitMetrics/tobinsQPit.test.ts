import { test, afterAll, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { computeAndWriteTobinsQPit } from '@/domainPitMetrics/valuation/tobinsQ/computeTobinsQPit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '@/domainPitMetrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '@/infrastructure/prisma/mopsExportClient';
import { twseExportPrisma } from '@/infrastructure/prisma/twseExportClient';
import { analysisPrisma } from '@/infrastructure/prisma/analysisClient';

// 托賓Q值 = (市值 + 總負債) / 總資產，純資產負債表時點快照，只有 Q 一種 basis。

beforeAll(async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.tobinsQ!);
});

test('tobinsQPit: 2330 115Q2，跟既有基準數字交叉驗證', async () => {
  await computeAndWriteTobinsQPit({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const q = await analysisPrisma.metricValue.findFirst({
    where: { symbol: '2330', metricCode: 'tobinsQ', periodType: 'Q', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' },
    orderBy: { knowledgeDate: 'desc' },
  });

  assert.ok(q, 'basis=Q 應該有寫入 metric_values');
  assert.equal(Number(q!.value), 6.9338);
  assert.equal(q!.nullReason, null);
});

test('tobinsQPit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await computeAndWriteTobinsQPit({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.q, { action: 'skipped_no_quarter' });
  const count = await analysisPrisma.metricValue.count({ where: { symbol: '9999', metricCode: 'tobinsQ' } });
  assert.equal(count, 0);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await twseExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
