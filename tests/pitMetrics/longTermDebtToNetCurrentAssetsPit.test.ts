import { test, afterAll, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { computeAndWriteLongTermDebtToNetCurrentAssetsPit } from '@/bootstrap/pitMetrics';
import { upsertMetricDefinition, metricDefinitionRegistry } from '@/application/metrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '@/infrastructure/prisma/mopsExportClient';
import { analysisPrisma } from '@/infrastructure/prisma/analysisClient';

beforeAll(async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.longTermDebtToNetCurrentAssets!);
});

// Benjamin Graham「財務體質健全」測試的後半條件：長期負債(長期借款+應付公司債非流動部分)
// 不超過淨流動資產(流動資產-流動負債)。2330 115Q2 實測值 31.92%（長期負債遠低於淨流動
// 資產，符合 Graham 門檻），見 computeLongTermDebtToNetCurrentAssetsPit.ts 的說明。
test('longTermDebtToNetCurrentAssetsPit: 2330 115Q2 合併報表，長期負債遠低於淨流動資產', async () => {
  await computeAndWriteLongTermDebtToNetCurrentAssetsPit({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const q = await analysisPrisma.metricValue.findFirst({
    where: { symbol: '2330', metricCode: 'longTermDebtToNetCurrentAssets', periodType: 'Q', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' },
    orderBy: { knowledgeDate: 'desc' },
  });

  assert.ok(q, 'basis=Q 應該有寫入 metric_values');
  assert.equal(Number(q!.value), 31.92);
  assert.equal(q!.nullReason, null);
});

test('longTermDebtToNetCurrentAssetsPit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await computeAndWriteLongTermDebtToNetCurrentAssetsPit({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.q, { action: 'skipped_no_quarter' });
  const count = await analysisPrisma.metricValue.count({ where: { symbol: '9999', metricCode: 'longTermDebtToNetCurrentAssets' } });
  assert.equal(count, 0);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
