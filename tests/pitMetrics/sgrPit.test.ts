import { test, afterAll, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { computeAndWriteSgrPit } from '@/domainPitMetrics/growth/sgr/computeSgrPit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '@/domainPitMetrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '@/infrastructure/prisma/mopsExportClient';
import { analysisPrisma } from '@/infrastructure/prisma/analysisClient';

// 第三批遷移（sgr）——獨立重新計算 ROE TTM + 配息率 TTM（不依賴 roe/dividendPayoutRatio
// 這兩個 metric_code 已寫入的值），跟 tests/domains/metrics/sgr.test.ts 的既有基準數字
// 交叉驗證，能抓出「獨立重算」這條路徑本身的 bug。

beforeAll(async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.sgr!);
});

test('sgrPit: 2330 115Q2 合併報表（只有 TTM 口徑），跟既有基準數字交叉驗證', async () => {
  await computeAndWriteSgrPit({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const ttm = await analysisPrisma.metricValue.findFirst({
    where: { symbol: '2330', metricCode: 'sgr', periodType: 'TTM', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' },
    orderBy: { knowledgeDate: 'desc' },
  });

  assert.ok(ttm, 'basis=TTM 應該有寫入 metric_values');
  assert.equal(Number(ttm!.value), 26.52);
  assert.equal(ttm!.nullReason, null);
});

test('sgrPit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await computeAndWriteSgrPit({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.ttm, { action: 'skipped_no_quarter' });
  const count = await analysisPrisma.metricValue.count({ where: { symbol: '9999', metricCode: 'sgr' } });
  assert.equal(count, 0);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
