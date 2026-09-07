import { test, afterAll, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { computeAndWriteRevenuePerSharePit } from '@/pitMetrics/profitability/revenuePerShare/computeRevenuePerSharePit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '@/pitMetrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// 第三批遷移（revenuePerShare）——跟 tests/domains/metrics/revenuePerShare.test.ts 的既有
// 基準數字交叉驗證。

beforeAll(async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.revenuePerShare!);
});

test('revenuePerSharePit: 2330 115Q2 合併報表，跟 revenuePerShare.test.ts 的既有基準數字交叉驗證', async () => {
  await computeAndWriteRevenuePerSharePit({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const findLatest = (basis: string) =>
    analysisPrisma.metricValue.findFirst({
      where: { symbol: '2330', metricCode: 'revenuePerShare', basis, fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' },
      orderBy: { knowledgeDate: 'desc' },
    });

  const q = await findLatest('Q');
  const qAnn = await findLatest('Q_ANN');
  const ttm = await findLatest('TTM');

  assert.ok(q && qAnn && ttm, '三個 basis 應該全部寫入 metric_values');
  assert.equal(Number(q!.value), 48.99);
  assert.equal(Number(qAnn!.value), 195.96);
  assert.equal(Number(ttm!.value), 171.23);
});

test('revenuePerSharePit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await computeAndWriteRevenuePerSharePit({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.q, { action: 'skipped_no_quarter' });
  const count = await analysisPrisma.metricValue.count({ where: { symbol: '9999', metricCode: 'revenuePerShare' } });
  assert.equal(count, 0);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
