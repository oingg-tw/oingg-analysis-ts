import { test, afterAll, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { computeAndWriteZmijewskiScorePit } from '@/bootstrap/pitMetrics';
import { metricDefinitionRegistry } from '@/application/metrics/metricDefinitionRegistry';
import { upsertMetricDefinition } from '@/bootstrap/metricDefinitions';
import { mopsExportPrisma } from '@/infrastructure/prisma/mopsExportClient';
import { analysisPrisma } from '@/infrastructure/prisma/analysisClient';

// 第四批（guru 分類）遷移——Probit 財務危機預警模型，淨利用 TTM、其餘資產負債表科目是
// 本季期末快照，沒有 YoY，跟 tests/domains/metrics/zmijewskiScore.test.ts 的既有基準
// 數字交叉驗證。

beforeAll(async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.zmijewskiScore!);
});

test('zmijewskiScorePit: 2330 115Q2 合併報表（只有 TTM 口徑），跟既有基準數字交叉驗證', async () => {
  await computeAndWriteZmijewskiScorePit({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const ttm = await analysisPrisma.metricValue.findFirst({
    where: { symbol: '2330', metricCode: 'zmijewskiScore', periodType: 'TTM', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' },
    orderBy: { knowledgeDate: 'desc' },
  });

  assert.ok(ttm, 'basis=TTM 應該有寫入 metric_values');
  assert.equal(Number(ttm!.value), -3.6198);
  assert.equal(ttm!.nullReason, null);
});

test('zmijewskiScorePit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await computeAndWriteZmijewskiScorePit({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.ttm, { action: 'skipped_no_quarter' });
  const count = await analysisPrisma.metricValue.count({ where: { symbol: '9999', metricCode: 'zmijewskiScore' } });
  assert.equal(count, 0);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
