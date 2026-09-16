import { test, afterAll, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { computeAndWritePFcfPit } from '@/bootstrap/pitMetrics';
import { metricDefinitionRegistry } from '@/application/metrics/metricDefinitionRegistry';
import { upsertMetricDefinition } from '@/bootstrap/metricDefinitions';
import { mopsExportPrisma } from '@/infrastructure/prisma/mopsExportClient';
import { analysisPrisma } from '@/infrastructure/prisma/analysisClient';

// P_FCF 用到逐日更新的市值資料，數值每天在變，不釘死確切數字，只驗證合理性。

beforeAll(async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.pFcf!);
});

test('pFcfPit: 2330 115Q2 合併報表，寫入的值應該落在合理區間', async () => {
  await computeAndWritePFcfPit({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const ttm = await analysisPrisma.metricValue.findFirst({
    where: { symbol: '2330', metricCode: 'pFcf', periodType: 'TTM', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' },
    orderBy: { knowledgeDate: 'desc' },
  });

  assert.ok(ttm, 'basis=TTM 應該有寫入（2330 自由現金流通常為正，有市值覆蓋）');
  if (ttm!.value !== null) {
    const value = Number(ttm!.value);
    assert.ok(value > 0 && value < 1000, `pFcfTtm=${value} 數量級異常`);
  }
});

test('pFcfPit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await computeAndWritePFcfPit({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.ttm, { action: 'skipped_no_quarter' });
  const count = await analysisPrisma.metricValue.count({ where: { symbol: '9999', metricCode: 'pFcf' } });
  assert.equal(count, 0);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
