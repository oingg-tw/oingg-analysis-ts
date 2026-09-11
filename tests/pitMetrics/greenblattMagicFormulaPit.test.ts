import { test, afterAll, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { computeAndWriteGreenblattEarningsYieldPit } from '@/domainPitMetrics/valuation/greenblattEarningsYield/computeGreenblattEarningsYieldPit';
import { computeAndWriteGreenblattRocPit } from '@/domainPitMetrics/profitability/greenblattRoc/computeGreenblattRocPit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '@/domainPitMetrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { twseExportPrisma } from '@/adapters/prisma/twseExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// Joel Greenblatt「神奇公式」的兩個組成指標：EBIT(TTM)/EV（Greenblatt 盈餘收益率）跟
// EBIT(TTM)/(淨營運資金+淨固定資產)（Greenblatt 資本報酬率）。只有 TTM 一種 basis。

beforeAll(async () => {
  await Promise.all(['greenblattEarningsYield', 'greenblattRoc'].map((code) => upsertMetricDefinition(metricDefinitionRegistry[code]!)));
});

test('greenblattEarningsYieldPit: 2330 115Q2，跟既有基準數字交叉驗證', async () => {
  await computeAndWriteGreenblattEarningsYieldPit({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const ttm = await analysisPrisma.metricValue.findFirst({
    where: { symbol: '2330', metricCode: 'greenblattEarningsYield', periodType: 'TTM', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' },
    orderBy: { knowledgeDate: 'desc' },
  });

  assert.ok(ttm, 'basis=TTM 應該有寫入 metric_values');
  assert.equal(Number(ttm!.value), 4.48);
  assert.equal(ttm!.nullReason, null);
});

test('greenblattRocPit: 2330 115Q2，跟既有基準數字交叉驗證', async () => {
  await computeAndWriteGreenblattRocPit({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const ttm = await analysisPrisma.metricValue.findFirst({
    where: { symbol: '2330', metricCode: 'greenblattRoc', periodType: 'TTM', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' },
    orderBy: { knowledgeDate: 'desc' },
  });

  assert.ok(ttm, 'basis=TTM 應該有寫入 metric_values');
  assert.equal(Number(ttm!.value), 38.22);
  assert.equal(ttm!.nullReason, null);
});

test('greenblattEarningsYieldPit/greenblattRocPit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const eyOutcome = await computeAndWriteGreenblattEarningsYieldPit({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });
  const rocOutcome = await computeAndWriteGreenblattRocPit({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(eyOutcome.ttm, { action: 'skipped_no_quarter' });
  assert.deepEqual(rocOutcome.ttm, { action: 'skipped_no_quarter' });
  assert.equal(await analysisPrisma.metricValue.count({ where: { symbol: '9999', metricCode: 'greenblattEarningsYield' } }), 0);
  assert.equal(await analysisPrisma.metricValue.count({ where: { symbol: '9999', metricCode: 'greenblattRoc' } }), 0);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await twseExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
