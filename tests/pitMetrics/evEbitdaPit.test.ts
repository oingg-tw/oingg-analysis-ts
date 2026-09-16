import { test, afterAll, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { computeAndWriteEvEbitdaPit } from '@/domainPitMetrics/valuation/evEbitda/computeEvEbitdaPit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '@/domainPitMetrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '@/infrastructure/prisma/mopsExportClient';
import { analysisPrisma } from '@/infrastructure/prisma/analysisClient';

// EV_EBITDA 用到逐日更新的市值資料，數值每天在變，不釘死確切數字，只驗證合理性。

beforeAll(async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.evEbitda!);
});

test('evEbitdaPit: 2330 115Q2 合併報表，寫入的值應該落在合理區間', async () => {
  await computeAndWriteEvEbitdaPit({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const ttm = await analysisPrisma.metricValue.findFirst({
    where: { symbol: '2330', metricCode: 'evEbitda', periodType: 'TTM', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' },
    orderBy: { knowledgeDate: 'desc' },
  });

  assert.ok(ttm, '市值、淨負債、TTM EBITDA 都齊全，basis=TTM 應該有寫入');
  if (ttm!.value !== null) {
    const value = Number(ttm!.value);
    assert.ok(value > 0 && value < 1000, `evToEbitdaTtm=${value} 數量級異常`);
  }
});

test('evEbitdaPit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await computeAndWriteEvEbitdaPit({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.ttm, { action: 'skipped_no_quarter' });
  const count = await analysisPrisma.metricValue.count({ where: { symbol: '9999', metricCode: 'evEbitda' } });
  assert.equal(count, 0);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
