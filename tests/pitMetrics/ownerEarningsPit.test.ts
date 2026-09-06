import { test, afterAll, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { computeAndWriteOwnerEarningsPit } from '@/pitMetrics/ownerEarnings/computeOwnerEarningsPit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '@/pitMetrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// 第四批（guru 分類）遷移——股東盈餘（淨利+折舊攤銷+資本支出）/流通股數，跟
// tests/domains/metrics/ownerEarnings.test.ts 的既有基準數字交叉驗證，Q/Q_ANN/TTM 三個
// basis 都有。

beforeAll(async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.ownerEarnings!);
});

test('ownerEarningsPit: 2330 115Q2 合併報表，跟既有基準數字交叉驗證', async () => {
  await computeAndWriteOwnerEarningsPit({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const where = { symbol: '2330', metricCode: 'ownerEarnings', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' };
  const q = await analysisPrisma.metricValue.findFirst({ where: { ...where, basis: 'Q' }, orderBy: { knowledgeDate: 'desc' } });
  const qAnn = await analysisPrisma.metricValue.findFirst({ where: { ...where, basis: 'Q_ANN' }, orderBy: { knowledgeDate: 'desc' } });
  const ttm = await analysisPrisma.metricValue.findFirst({ where: { ...where, basis: 'TTM' }, orderBy: { knowledgeDate: 'desc' } });

  assert.ok(q, 'basis=Q 應該有寫入');
  assert.equal(Number(q!.value), 15.78);
  assert.ok(qAnn, 'basis=Q_ANN 應該有寫入');
  assert.equal(Number(qAnn!.value), 63.12);
  assert.ok(ttm, 'basis=TTM 應該有寫入');
  assert.equal(Number(ttm!.value), 55.33);
});

test('ownerEarningsPit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await computeAndWriteOwnerEarningsPit({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.q, { action: 'skipped_no_quarter' });
  const count = await analysisPrisma.metricValue.count({ where: { symbol: '9999', metricCode: 'ownerEarnings' } });
  assert.equal(count, 0);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
