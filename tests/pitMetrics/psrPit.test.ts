import { test, afterAll, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { computeAndWritePsrPit } from '@/bootstrap/pitMetrics';
import { metricDefinitionRegistry } from '@/application/metrics/metricDefinitionRegistry';
import { upsertMetricDefinition } from '@/bootstrap/metricDefinitions';
import { mopsExportPrisma } from '@/infrastructure/prisma/mopsExportClient';
import { analysisPrisma } from '@/infrastructure/prisma/analysisClient';

// PSR 用到逐日更新的市值資料，數值每天在變，不釘死確切數字，只驗證合理性，跟
// tests/domains/metrics/psr.test.ts 同一種測試風格。

beforeAll(async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.psr!);
});

test('psrPit: 2330 115Q2 合併報表，寫入的值應該落在合理區間', async () => {
  await computeAndWritePsrPit({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const ttm = await analysisPrisma.metricValue.findFirst({
    where: { symbol: '2330', metricCode: 'psr', periodType: 'TTM', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' },
    orderBy: { knowledgeDate: 'desc' },
  });

  assert.ok(ttm, 'basis=TTM 應該有寫入（2330 有市值覆蓋）');
  if (ttm!.value !== null) {
    const value = Number(ttm!.value);
    assert.ok(value > 0 && value < 1000, `psrTtm=${value} 數量級異常`);
  }
});

test('psrPit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await computeAndWritePsrPit({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.ttm, { action: 'skipped_no_quarter' });
  const count = await analysisPrisma.metricValue.count({ where: { symbol: '9999', metricCode: 'psr' } });
  assert.equal(count, 0);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
