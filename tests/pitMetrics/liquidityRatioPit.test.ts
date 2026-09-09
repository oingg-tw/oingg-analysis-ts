import { test, afterAll, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { computeAndWriteLiquidityRatioPit } from '@/domainPitMetrics/resilience/liquidityRatio/computeLiquidityRatioPit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '@/domainPitMetrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

beforeAll(async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.currentRatio!);
  await upsertMetricDefinition(metricDefinitionRegistry.quickRatio!);
  await upsertMetricDefinition(metricDefinitionRegistry.cashRatio!);
});

test('liquidityRatioPit: 2330 115Q2 合併報表，跟 liquidityRatio.test.ts 的既有基準數字交叉驗證', async () => {
  await computeAndWriteLiquidityRatioPit({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const findLatest = (metricCode: string) =>
    analysisPrisma.metricValue.findFirst({
      where: { symbol: '2330', metricCode, periodType: 'Q', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' },
      orderBy: { knowledgeDate: 'desc' },
    });

  const current = await findLatest('currentRatio');
  const quick = await findLatest('quickRatio');
  const cash = await findLatest('cashRatio');

  assert.ok(current && quick && cash, '三個 metric_code 應該全部寫入');
  assert.equal(Number(current!.value), 245.76);
  assert.equal(Number(quick!.value), 225.01);
  assert.equal(Number(cash!.value), 168.71);
});

test('liquidityRatioPit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await computeAndWriteLiquidityRatioPit({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.currentRatio, { action: 'skipped_no_quarter' });
  const count = await analysisPrisma.metricValue.count({ where: { symbol: '9999', metricCode: { in: ['currentRatio', 'quickRatio', 'cashRatio'] } } });
  assert.equal(count, 0);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
