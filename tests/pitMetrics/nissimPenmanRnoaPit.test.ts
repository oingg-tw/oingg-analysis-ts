import { test, afterAll, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { computeAndWriteNissimPenmanRnoaPit } from '@/pitMetrics/profitability/nissimPenmanRnoa/computeNissimPenmanRnoaPit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '@/pitMetrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// 第四批（guru 分類）遷移——只遷移 RNOA 本身（NOPAT/NOA），不遷移
// FLEV/NBC/SPREAD/reconstructedRoe，跟 tests/domains/metrics/nissimPenmanRnoa.test.ts 的
// 既有基準數字交叉驗證。Q_ANN = round2(rnoaQuarterlyPct x 4)，是 rnoaQuarterlyPct 的純
// 線性推導，這裡一併驗證。

beforeAll(async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.nissimPenmanRnoa!);
});

test('nissimPenmanRnoaPit: 2330 115Q2 合併報表，跟既有基準數字交叉驗證', async () => {
  await computeAndWriteNissimPenmanRnoaPit({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const where = { symbol: '2330', metricCode: 'nissimPenmanRnoa', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' };
  const q = await analysisPrisma.metricValue.findFirst({ where: { ...where, periodType: 'Q' }, orderBy: { knowledgeDate: 'desc' } });
  const qAnn = await analysisPrisma.metricValue.findFirst({ where: { ...where, periodType: 'Q_ANN' }, orderBy: { knowledgeDate: 'desc' } });
  const ttm = await analysisPrisma.metricValue.findFirst({ where: { ...where, periodType: 'TTM' }, orderBy: { knowledgeDate: 'desc' } });

  assert.ok(q, 'basis=Q 應該有寫入');
  assert.equal(Number(q!.value), 15.09);
  assert.ok(qAnn, 'basis=Q_ANN 應該有寫入');
  assert.equal(Number(qAnn!.value), 60.36);
  assert.ok(ttm, 'basis=TTM 應該有寫入');
  assert.equal(Number(ttm!.value), 50.2);
});

test('nissimPenmanRnoaPit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await computeAndWriteNissimPenmanRnoaPit({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.q, { action: 'skipped_no_quarter' });
  const count = await analysisPrisma.metricValue.count({ where: { symbol: '9999', metricCode: 'nissimPenmanRnoa' } });
  assert.equal(count, 0);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
