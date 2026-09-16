import { test, afterAll, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { computeAndWriteRoicPit } from '@/application/metrics/profitability/roic/computeRoicPit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '@/application/metrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '@/infrastructure/prisma/mopsExportClient';
import { analysisPrisma } from '@/infrastructure/prisma/analysisClient';

beforeAll(async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.roic!);
});

test('roicPit: 2330 115Q2 合併報表，跟既有基準數字交叉驗證', async () => {
  await computeAndWriteRoicPit({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const findLatest = (periodType: string) =>
    analysisPrisma.metricValue.findFirst({
      where: { symbol: '2330', metricCode: 'roic', periodType, fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' },
      orderBy: { knowledgeDate: 'desc' },
    });

  const q = await findLatest('Q');
  const ttm = await findLatest('TTM');

  assert.ok(q && ttm, '兩個 periodType 應該全部寫入');
  assert.equal(Number(q!.value), 17.04);
  assert.equal(Number(ttm!.value), 53.97);
});

test('roicPit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await computeAndWriteRoicPit({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.q, { action: 'skipped_no_quarter' });
  const count = await analysisPrisma.metricValue.count({ where: { symbol: '9999', metricCode: 'roic' } });
  assert.equal(count, 0);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
