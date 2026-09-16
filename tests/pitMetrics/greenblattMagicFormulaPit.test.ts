import { test, afterAll, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { computeAndWriteGreenblattRocPit } from '@/bootstrap/pitMetrics';
import { metricDefinitionRegistry } from '@/application/metrics/metricDefinitionRegistry';
import { upsertMetricDefinition } from '@/bootstrap/metricDefinitions';
import { mopsExportPrisma } from '@/infrastructure/prisma/mopsExportClient';
import { twseExportPrisma } from '@/infrastructure/prisma/twseExportClient';
import { analysisPrisma } from '@/infrastructure/prisma/analysisClient';

// Joel Greenblatt「神奇公式」的兩個組成指標：EBIT(TTM)/EV（Greenblatt 盈餘收益率）跟
// EBIT(TTM)/(淨營運資金+淨固定資產)（Greenblatt 資本報酬率）。只有 TTM 一種 basis。
// 2026-09-14 使用者要求：greenblattEarningsYield 先不單獨曝露成獨立指標（等神奇公式排名
// 方法論上線再合併），已從 metricDefinitionRegistry 移除，這裡對應的測試案例一併移除
// ——computeAndWriteGreenblattEarningsYieldPit 函式本身還在（見
// src/domainPitMetrics/valuation/greenblattEarningsYield/），只是 writeMetricValue()
// 對未註冊的 metricCode 一律 rejected，不會意外寫入。greenblattRoc 維持照常曝露/測試。

beforeAll(async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.greenblattRoc!);
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

test('greenblattRocPit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const rocOutcome = await computeAndWriteGreenblattRocPit({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(rocOutcome.ttm, { action: 'skipped_no_quarter' });
  assert.equal(await analysisPrisma.metricValue.count({ where: { symbol: '9999', metricCode: 'greenblattRoc' } }), 0);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await twseExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
