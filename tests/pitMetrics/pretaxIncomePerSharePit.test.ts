import { test, afterAll, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { computeAndWritePretaxIncomePerSharePit } from '@/application/metrics/profitability/pretaxIncomePerShare/computePretaxIncomePerSharePit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '@/application/metrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '@/infrastructure/prisma/mopsExportClient';
import { analysisPrisma } from '@/infrastructure/prisma/analysisClient';

// 2026-09-15 應 web-nuxt「營收到股利去了哪裡」瀑布圖卡片需求新增——跟 epsPit.test.ts
// 同一種形狀（同一份損益表資料，分子換成稅前淨利），基準數字直接跑一次 compute 函式現查
// 得出（跟 eps 那組 27.25/86.27 是同一份原始資料，稅前淨利理應大於稅後淨利，數字吻合）。

beforeAll(async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.pretaxIncomePerShare!);
});

test('pretaxIncomePerSharePit: 2330 115Q2 合併報表，稅前淨利應大於同期 EPS（稅後）', async () => {
  await computeAndWritePretaxIncomePerSharePit({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const findLatest = (periodType: string) =>
    analysisPrisma.metricValue.findFirst({
      where: { symbol: '2330', metricCode: 'pretaxIncomePerShare', periodType, fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' },
      orderBy: { knowledgeDate: 'desc' },
    });

  const q = await findLatest('Q');
  const ttm = await findLatest('TTM');

  assert.ok(q && ttm, '兩個 periodType 應該全部寫入 metric_values');
  assert.equal(Number(q!.value), 33.26);
  assert.equal(Number(ttm!.value), 102.88);
  assert.equal(q!.nullReason, null);
  assert.ok(Number(q!.value) > 27.25, '稅前淨利每股應該大於同期 eps（稅後淨利每股，見 epsPit.test.ts 的既有基準數字）');
});

test('pretaxIncomePerSharePit: 9999（查無資料的公司）應該優雅降級，都不寫入', async () => {
  const outcome = await computeAndWritePretaxIncomePerSharePit({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.q, { action: 'skipped_no_quarter' });
  const count = await analysisPrisma.metricValue.count({ where: { symbol: '9999', metricCode: 'pretaxIncomePerShare' } });
  assert.equal(count, 0);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
