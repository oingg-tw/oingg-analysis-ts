import { test, afterAll, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { computeAndWritePbRatioPit } from '@/bootstrap/pitMetrics';
import { metricDefinitionRegistry } from '@/application/metrics/metricDefinitionRegistry';
import { upsertMetricDefinition } from '@/bootstrap/metricDefinitions';
import { mopsExportPrisma } from '@/infrastructure/prisma/mopsExportClient';
import { twseExportPrisma } from '@/infrastructure/prisma/twseExportClient';
import { analysisPrisma } from '@/infrastructure/prisma/analysisClient';

// 本淨比 = 股價(knowledge_date) / BVPS(Q)，獨立重新算 BVPS（跟 bvps metric_code 算法相同，
// 但不讀取 bvps 已寫入的 metric_value）。2026-09-07 用 2330 115Q2 真實資料交叉驗證：
// BVPS=248.05（跟 bvps metric_code 的基準值一致），knowledge_date 2026-08-11 當天股價
// 2395，round2(2395/248.05)=9.66。

beforeAll(async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.pbRatio!);
});

test('pbRatioPit: 2330 115Q2，用真實股價/BVPS 手動核算過的基準數字交叉驗證', async () => {
  const outcome = await computeAndWritePbRatioPit({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const q = await analysisPrisma.metricValue.findFirst({
    where: { symbol: '2330', metricCode: 'pbRatio', periodType: 'Q', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' },
    orderBy: { knowledgeDate: 'desc' },
  });

  assert.notEqual(outcome.q, undefined);
  assert.ok(q, 'basis=Q 應該有寫入 metric_values');
  assert.equal(Number(q!.value), 9.66);
  assert.equal(q!.nullReason, null);
});

test('pbRatioPit: 重跑同一組座標，去重邏輯應該讓第二次 skipped_unchanged，且列數維持 1', async () => {
  const query = { symbol: '2330', year: '115', season: '1' as const, dataType: '2' as const, subsidiaryCompanyId: '' };
  await computeAndWritePbRatioPit(query);
  const second = await computeAndWritePbRatioPit(query);

  assert.deepEqual(second.q, { action: 'skipped_unchanged' });

  const count = await analysisPrisma.metricValue.count({
    where: { symbol: '2330', metricCode: 'pbRatio', periodType: 'Q', fiscalYear: 2026, fiscalQuarter: 1, dataType: '2', subsidiaryCompanyId: '' },
  });
  assert.equal(count, 1, '重複寫入同一個座標不應該疊加成多列');
});

test('pbRatioPit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await computeAndWritePbRatioPit({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(outcome.rocYear, null);
  assert.equal(outcome.season, null);
  assert.deepEqual(outcome.q, { action: 'skipped_no_quarter' });

  const count = await analysisPrisma.metricValue.count({ where: { symbol: '9999', metricCode: 'pbRatio' } });
  assert.equal(count, 0);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await twseExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
