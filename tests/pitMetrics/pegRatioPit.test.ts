import { test, afterAll, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { computeAndWritePegRatioPit } from '@/domainPitMetrics/valuation/pegRatio/computePegRatioPit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '@/domainPitMetrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '@/infrastructure/prisma/mopsExportClient';
import { analysisPrisma } from '@/infrastructure/prisma/analysisClient';

beforeAll(async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.pegRatio!);
});

test('pegRatioPit: 2330 115Q2，跟 peRatio.TTM ÷ epsCagr5y 交叉驗證', async () => {
  await computeAndWritePegRatioPit({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const ttm = await analysisPrisma.metricValue.findFirst({
    where: { symbol: '2330', metricCode: 'pegRatio', periodType: 'TTM', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' },
    orderBy: { knowledgeDate: 'desc' },
  });

  assert.ok(ttm, 'basis=TTM 應該有寫入');
  assert.equal(Number(ttm!.value), 1.02, '27.76 (peRatio.TTM) / 27.1 (epsCagr5y) = 1.02');
  assert.equal(ttm!.nullReason, null);
});

test('pegRatioPit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await computeAndWritePegRatioPit({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.ttm, { action: 'skipped_no_quarter' });
  const count = await analysisPrisma.metricValue.count({ where: { symbol: '9999', metricCode: 'pegRatio' } });
  assert.equal(count, 0);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
