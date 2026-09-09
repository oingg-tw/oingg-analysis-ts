import { test, afterAll, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { computeAndWriteFcfYieldPit } from '@/domainPitMetrics/valuation/fcfYield/computeFcfYieldPit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '@/domainPitMetrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// 第三批遷移（fcfYield）——用到逐日更新的股價資料，數值每天在變，不釘死確切數字，只驗證
// 合理性，跟 tests/domains/metrics/fcfYield.test.ts 同一種測試風格。

beforeAll(async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.fcfYield!);
});

test('fcfYieldPit: 2330 115Q2 合併報表，寫入的值應該落在合理區間', async () => {
  await computeAndWriteFcfYieldPit({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const ttm = await analysisPrisma.metricValue.findFirst({
    where: { symbol: '2330', metricCode: 'fcfYield', periodType: 'TTM', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' },
    orderBy: { knowledgeDate: 'desc' },
  });

  assert.ok(ttm, 'basis=TTM 應該有寫入 metric_values（2330 有股價覆蓋）');
  if (ttm!.value !== null) {
    const value = Number(ttm!.value);
    assert.ok(value > 0 && value < 100, `fcfYieldTtmPct=${value} 數量級異常`);
  }
});

test('fcfYieldPit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await computeAndWriteFcfYieldPit({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.qAnn, { action: 'skipped_no_quarter' });
  const count = await analysisPrisma.metricValue.count({ where: { symbol: '9999', metricCode: 'fcfYield' } });
  assert.equal(count, 0);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
