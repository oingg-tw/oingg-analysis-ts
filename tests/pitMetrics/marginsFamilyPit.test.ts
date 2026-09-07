import { test, afterAll, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { computeAndWriteMarginsFamilyPit } from '@/pitMetrics/profitability/margins/computeMarginsFamilyPit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '@/pitMetrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// 第五批遷移（margins 補完整：grossMargin/operatingMargin）——跟
// tests/domains/metrics/margins.test.ts 的既有基準數字交叉驗證（該測試檔案只釘了
// quarterly 值，沒有 TTM 值，所以這裡也只驗證 Q，TTM 只驗證有寫入不驗證精確值）。

beforeAll(async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.grossMargin!);
  await upsertMetricDefinition(metricDefinitionRegistry.operatingMargin!);
});

test('marginsFamilyPit: 2330 115Q2 合併報表，跟既有基準數字交叉驗證', async () => {
  await computeAndWriteMarginsFamilyPit({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const grossQ = await analysisPrisma.metricValue.findFirst({
    where: { symbol: '2330', metricCode: 'grossMargin', basis: 'Q', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' },
    orderBy: { knowledgeDate: 'desc' },
  });
  const operatingQ = await analysisPrisma.metricValue.findFirst({
    where: { symbol: '2330', metricCode: 'operatingMargin', basis: 'Q', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' },
    orderBy: { knowledgeDate: 'desc' },
  });

  assert.ok(grossQ && operatingQ, 'Q basis 應該都寫入');
  assert.equal(Number(grossQ!.value), 67.72);
  assert.equal(Number(operatingQ!.value), 60.34);
  assert.equal(grossQ!.nullReason, null);
});

test('marginsFamilyPit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await computeAndWriteMarginsFamilyPit({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.grossMarginQ, { action: 'skipped_no_quarter' });
  const count = await analysisPrisma.metricValue.count({ where: { symbol: '9999', metricCode: { in: ['grossMargin', 'operatingMargin'] } } });
  assert.equal(count, 0);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
