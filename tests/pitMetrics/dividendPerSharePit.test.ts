import { test, afterAll, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { computeAndWriteDividendPerSharePit } from '@/application/metrics/dividend/dividendPerShare/computeDividendPerSharePit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '@/application/metrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '@/infrastructure/prisma/mopsExportClient';
import { analysisPrisma } from '@/infrastructure/prisma/analysisClient';

// 2026-09-15 應 web-nuxt「營收到股利去了哪裡」瀑布圖卡片需求新增——跟
// tests/pitMetrics/cashFlowPerSharePit.test.ts 同一種資料源，只有 TTM 一種 basis
// （跟 dividendPayoutRatio 同一個理由，股利通常一年發放1-2次，單季會嚴重失真）。

beforeAll(async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.dividendPerShare!);
});

test('dividendPerSharePit: 2330 115Q2 合併報表，只寫入 TTM，值應該是非負正值', async () => {
  const outcome = await computeAndWriteDividendPerSharePit({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  assert.notEqual(outcome.ttm.action, 'skipped_no_quarter');

  const ttm = await analysisPrisma.metricValue.findFirst({
    where: { symbol: '2330', metricCode: 'dividendPerShare', periodType: 'TTM', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' },
    orderBy: { knowledgeDate: 'desc' },
  });
  assert.ok(ttm, 'TTM 應該寫入');
  assert.ok(Number(ttm!.value) >= 0, '每股股利不應該是負值（來源欄位已轉絕對值）');
});

test('dividendPerSharePit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await computeAndWriteDividendPerSharePit({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.ttm, { action: 'skipped_no_quarter' });
  const count = await analysisPrisma.metricValue.count({ where: { symbol: '9999', metricCode: 'dividendPerShare' } });
  assert.equal(count, 0);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
