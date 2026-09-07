import { test, afterAll, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { computeAndWriteEpsPit } from '@/pitMetrics/profitability/eps/computeEpsPit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '@/pitMetrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// 第三批遷移（eps）——跟 tests/domains/metrics/eps.test.ts 的既有基準數字交叉驗證。

beforeAll(async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.eps!);
});

test('epsPit: 2330 115Q2 合併報表，跟 eps.test.ts 的既有基準數字交叉驗證', async () => {
  await computeAndWriteEpsPit({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const findLatest = (basis: string) =>
    analysisPrisma.metricValue.findFirst({
      where: { symbol: '2330', metricCode: 'eps', basis, fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' },
      orderBy: { knowledgeDate: 'desc' },
    });

  const q = await findLatest('Q');
  const qAnn = await findLatest('Q_ANN');
  const ttm = await findLatest('TTM');

  assert.ok(q && qAnn && ttm, '三個 basis 應該全部寫入 metric_values');
  assert.equal(Number(q!.value), 27.25);
  assert.equal(Number(qAnn!.value), 109);
  assert.equal(Number(ttm!.value), 86.27);
  assert.equal(q!.nullReason, null);
});

test('epsPit: 9999（查無資料的公司）應該優雅降級，三個 basis 都不寫入', async () => {
  const outcome = await computeAndWriteEpsPit({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.q, { action: 'skipped_no_quarter' });
  const count = await analysisPrisma.metricValue.count({ where: { symbol: '9999', metricCode: 'eps' } });
  assert.equal(count, 0);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
