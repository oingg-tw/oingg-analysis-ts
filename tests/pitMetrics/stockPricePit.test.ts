import { test, afterAll, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { computeAndWriteStockPricePit } from '@/application/metrics/valuation/stockPrice/computeStockPricePit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '@/application/metrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '@/infrastructure/prisma/mopsExportClient';
import { twseExportPrisma } from '@/infrastructure/prisma/twseExportClient';
import { analysisPrisma } from '@/infrastructure/prisma/analysisClient';

// 給 web-nuxt 河流圖用：peRatio/pbRatio 該期實際用來算比率的股價本身，不用反推。
// knowledge_date 解析只用資產負債表（跟 bvps/pbRatio 完全同步）。2026-09-07 用 2330
// 115Q2 真實資料交叉驗證：knowledge_date=2026-08-11 當天收盤價 2395（已在 pbRatio 那批
// 驗證過的同一個數字，這裡確認 stockPrice 本身也精確等於這個值）。

beforeAll(async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.stockPrice!);
});

test('stockPricePit: 2330 115Q2，價格應該精確等於 knowledge_date 當天收盤價（跟 pbRatio 用的同一個數字）', async () => {
  const outcome = await computeAndWriteStockPricePit({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const q = await analysisPrisma.metricValue.findFirst({
    where: { symbol: '2330', metricCode: 'stockPrice', periodType: 'Q', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' },
    orderBy: { knowledgeDate: 'desc' },
  });

  assert.notEqual(outcome.q, undefined);
  assert.ok(q, 'basis=Q 應該有寫入 metric_values');
  assert.equal(Number(q!.value), 2395);
  assert.equal(q!.nullReason, null);
  assert.equal(q!.knowledgeDate.toISOString().slice(0, 10), '2026-08-11');
});

test('stockPricePit: 重跑同一組座標，去重邏輯應該讓第二次 skipped_unchanged，且列數維持 1', async () => {
  const query = { symbol: '2330', year: '115', season: '1' as const, dataType: '2' as const, subsidiaryCompanyId: '' };
  await computeAndWriteStockPricePit(query);
  const second = await computeAndWriteStockPricePit(query);

  assert.deepEqual(second.q, { action: 'skipped_unchanged' });

  const count = await analysisPrisma.metricValue.count({
    where: { symbol: '2330', metricCode: 'stockPrice', periodType: 'Q', fiscalYear: 2026, fiscalQuarter: 1, dataType: '2', subsidiaryCompanyId: '' },
  });
  assert.equal(count, 1, '重複寫入同一個座標不應該疊加成多列');
});

test('stockPricePit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await computeAndWriteStockPricePit({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(outcome.rocYear, null);
  assert.equal(outcome.season, null);
  assert.deepEqual(outcome.q, { action: 'skipped_no_quarter' });

  const count = await analysisPrisma.metricValue.count({ where: { symbol: '9999', metricCode: 'stockPrice' } });
  assert.equal(count, 0);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await twseExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
