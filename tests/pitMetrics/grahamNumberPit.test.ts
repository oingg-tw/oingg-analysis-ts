import { test, afterAll, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { computeAndWriteGrahamNumberPit } from '@/application/metrics/valuation/grahamNumber/computeGrahamNumberPit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '@/application/metrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '@/infrastructure/prisma/mopsExportClient';
import { analysisPrisma } from '@/infrastructure/prisma/analysisClient';

// 第四批（guru 分類）遷移——獨立重新計算 EPS(TTM)/BVPS（不依賴 eps/bvps 這兩個
// metric_code 已寫入的值）。2026-09-10 公式改成 PER(TTM) × PBR（不再是
// sqrt(22.5×EPS×BVPS)，理由見 computeGrahamNumberPit.ts 的說明），基準數字換成跟
// peRatio.TTM × pbRatio.Q 交叉驗證（27.76 × 9.66 = 268.16）。

beforeAll(async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.grahamNumber!);
});

test('grahamNumberPit: 2330 115Q2 合併報表（只有 TTM 口徑），跟 peRatio×pbRatio 交叉驗證', async () => {
  await computeAndWriteGrahamNumberPit({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const ttm = await analysisPrisma.metricValue.findFirst({
    where: { symbol: '2330', metricCode: 'grahamNumber', periodType: 'TTM', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' },
    orderBy: { knowledgeDate: 'desc' },
  });

  assert.ok(ttm, 'basis=TTM 應該有寫入 metric_values');
  assert.equal(Number(ttm!.value), 268.16);
  assert.equal(ttm!.nullReason, null);
});

test('grahamNumberPit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await computeAndWriteGrahamNumberPit({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.ttm, { action: 'skipped_no_quarter' });
  const count = await analysisPrisma.metricValue.count({ where: { symbol: '9999', metricCode: 'grahamNumber' } });
  assert.equal(count, 0);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
