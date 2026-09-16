import { test, afterAll, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { computeAndWriteOneDollarTestPit } from '@/application/metrics/profitability/oneDollarTest/computeOneDollarTestPit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '@/application/metrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '@/infrastructure/prisma/mopsExportClient';
import { twseExportPrisma } from '@/infrastructure/prisma/twseExportClient';
import { analysisPrisma } from '@/infrastructure/prisma/analysisClient';

// 一美元原則（Warren Buffett, 1983）= 近 5 年市值淨變化 / 近 5 年累計保留盈餘。實測
// 2026-09-14 確認 2330 有完整 5 年（20 季）資料，算出 7.21（市值成長遠超過保留盈餘，跟
// 台積電近幾年受 AI/先進製程需求推升股價大漲的實際狀況吻合），用這組當基準值交叉驗證。

beforeAll(async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.oneDollarTest!);
});

test('oneDollarTestPit: 2330，跟實測基準數字交叉驗證', async () => {
  await computeAndWriteOneDollarTestPit({ symbol: '2330', dataType: '2', subsidiaryCompanyId: '' });

  const fy = await analysisPrisma.metricValue.findFirst({
    where: { symbol: '2330', metricCode: 'oneDollarTest', periodType: 'FY', dataType: '2', subsidiaryCompanyId: '' },
    orderBy: { knowledgeDate: 'desc' },
  });

  assert.ok(fy, 'basis=FY 應該有寫入');
  assert.equal(Number(fy!.value), 7.21);
  assert.equal(fy!.nullReason, null);
});

test('oneDollarTestPit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await computeAndWriteOneDollarTestPit({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.fy, { action: 'skipped_no_quarter' });
  const count = await analysisPrisma.metricValue.count({ where: { symbol: '9999', metricCode: 'oneDollarTest' } });
  assert.equal(count, 0);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await twseExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
