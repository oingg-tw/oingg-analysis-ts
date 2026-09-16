import { test, afterAll, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { computeAndWriteIncomeStatementPerSharePit } from '@/bootstrap/pitMetrics';
import { metricDefinitionRegistry } from '@/application/metrics/metricDefinitionRegistry';
import { upsertMetricDefinition } from '@/bootstrap/metricDefinitions';
import { mopsExportPrisma } from '@/infrastructure/prisma/mopsExportClient';
import { analysisPrisma } from '@/infrastructure/prisma/analysisClient';

// 2026-09-15 應 web-nuxt「營收到股利去了哪裡」瀑布圖卡片需求新增——跟
// tests/pitMetrics/epsPit.test.ts 同一種形狀，只是分子換成毛利/營業利益。

beforeAll(async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.grossProfitPerShare!);
  await upsertMetricDefinition(metricDefinitionRegistry.operatingIncomePerShare!);
});

test('incomeStatementPerSharePit: 2330 115Q2 合併報表，兩個 metric_code 都應該寫入且毛利大於營業利益', async () => {
  await computeAndWriteIncomeStatementPerSharePit({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const findLatest = (metricCode: string, periodType: string) =>
    analysisPrisma.metricValue.findFirst({
      where: { symbol: '2330', metricCode, periodType, fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' },
      orderBy: { knowledgeDate: 'desc' },
    });

  const grossQ = await findLatest('grossProfitPerShare', 'Q');
  const opQ = await findLatest('operatingIncomePerShare', 'Q');

  assert.ok(grossQ && opQ, '兩個 metric_code 都應該寫入 Q periodType');
  assert.ok(Number(grossQ!.value) > 0, '2330 每股毛利應該是正值');
  assert.ok(Number(grossQ!.value) > Number(opQ!.value), '毛利應該大於營業利益（營業利益 = 毛利 - 營業費用）');
});

test('incomeStatementPerSharePit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await computeAndWriteIncomeStatementPerSharePit({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.grossProfitPerShareQ, { action: 'skipped_no_quarter' });
  const count = await analysisPrisma.metricValue.count({ where: { symbol: '9999', metricCode: { in: ['grossProfitPerShare', 'operatingIncomePerShare'] } } });
  assert.equal(count, 0);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
