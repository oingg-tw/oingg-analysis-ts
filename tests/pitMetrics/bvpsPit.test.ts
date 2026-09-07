import { test, afterAll, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { computeAndWriteBvpsPit } from '@/pitMetrics/valuation/bvps/computeBvpsPit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '@/pitMetrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// 第三批遷移（bvps）——跟 tests/domains/metrics/bvps.test.ts 的既有基準數字交叉驗證。

beforeAll(async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.bvps!);
});

test('bvpsPit: 2330 115Q2 合併報表，跟 bvps.test.ts 的既有基準數字交叉驗證', async () => {
  await computeAndWriteBvpsPit({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const q = await analysisPrisma.metricValue.findFirst({
    where: { symbol: '2330', metricCode: 'bvps', basis: 'Q', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' },
    orderBy: { knowledgeDate: 'desc' },
  });

  assert.ok(q, 'basis=Q 應該有寫入 metric_values');
  assert.equal(Number(q!.value), 248.05);
  assert.equal(q!.nullReason, null);
});

test('bvpsPit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await computeAndWriteBvpsPit({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.q, { action: 'skipped_no_quarter' });
  const count = await analysisPrisma.metricValue.count({ where: { symbol: '9999', metricCode: 'bvps' } });
  assert.equal(count, 0);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
