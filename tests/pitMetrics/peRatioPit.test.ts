import { test, afterAll, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { computeAndWritePeRatioPit } from '@/pitMetrics/peRatio/computePeRatioPit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '@/pitMetrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { twseExportPrisma } from '@/adapters/prisma/twseExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// 本益比 = 股價(knowledge_date) / EPS(TTM)，獨立重新算 EPS_TTM（跟 eps metric_code 的
// TTM 算法相同，但不讀取 eps 已寫入的 metric_value）。2026-09-07 用 2330 115Q2 真實資料
// 交叉驗證：EPS_TTM=86.27（跟 eps metric_code 的 TTM 基準值一致），knowledge_date
// 2026-08-11 當天股價 2395，round2(2395/86.27)=27.76。

beforeAll(async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.peRatio!);
});

test('peRatioPit: 2330 115Q2，用真實股價/EPS_TTM 手動核算過的基準數字交叉驗證', async () => {
  const outcome = await computeAndWritePeRatioPit({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const ttm = await analysisPrisma.metricValue.findFirst({
    where: { symbol: '2330', metricCode: 'peRatio', basis: 'TTM', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' },
    orderBy: { knowledgeDate: 'desc' },
  });

  assert.notEqual(outcome.ttm, undefined);
  assert.ok(ttm, 'basis=TTM 應該有寫入 metric_values');
  assert.equal(Number(ttm!.value), 27.76);
  assert.equal(ttm!.nullReason, null);
});

test('peRatioPit: 重跑同一組座標，去重邏輯應該讓第二次全部 skipped_unchanged，且列數維持 1', async () => {
  const query = { symbol: '2330', year: '115', season: '1' as const, dataType: '2' as const, subsidiaryCompanyId: '' };
  await computeAndWritePeRatioPit(query);
  const second = await computeAndWritePeRatioPit(query);

  if ('action' in second.ttm && (second.ttm.action === 'skipped_no_quarter' || second.ttm.action === 'skipped_no_knowledge_date')) {
    // 這組座標本來就算不出 TTM，不構成去重測試的一部分。
  } else {
    assert.deepEqual(second.ttm, { action: 'skipped_unchanged' });
  }

  const count = await analysisPrisma.metricValue.count({
    where: { symbol: '2330', metricCode: 'peRatio', basis: 'TTM', fiscalYear: 2026, fiscalQuarter: 1, dataType: '2', subsidiaryCompanyId: '' },
  });
  assert.equal(count, 1, '重複寫入同一個座標不應該疊加成多列');
});

test('peRatioPit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await computeAndWritePeRatioPit({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(outcome.rocYear, null);
  assert.equal(outcome.season, null);
  assert.deepEqual(outcome.ttm, { action: 'skipped_no_quarter' });

  const count = await analysisPrisma.metricValue.count({ where: { symbol: '9999', metricCode: 'peRatio' } });
  assert.equal(count, 0);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await twseExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
