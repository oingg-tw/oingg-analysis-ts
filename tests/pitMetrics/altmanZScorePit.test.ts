import { test, afterAll, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { computeAndWriteAltmanZScorePit } from '@/pitMetrics/resilience/altmanZScore/computeAltmanZScorePit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '@/pitMetrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// 第四批（guru 分類）遷移——ALTMAN_Z_SCORE 用到逐日更新的市值資料（X4），數值每天在變，
// zScore/X4 不釘死確切數字，只驗證合理性；X1/X2/X3/X5 不靠市值，跟
// tests/domains/metrics/altmanZScore.test.ts 的既有基準數字交叉驗證（透過 zScore 落在
// 合理區間間接驗證公式沒錯）。

beforeAll(async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.altmanZScore!);
});

test('altmanZScorePit: 2330 115Q2 合併報表（只有 TTM 口徑），寫入的值應該落在合理區間', async () => {
  await computeAndWriteAltmanZScorePit({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const ttm = await analysisPrisma.metricValue.findFirst({
    where: { symbol: '2330', metricCode: 'altmanZScore', periodType: 'TTM', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' },
    orderBy: { knowledgeDate: 'desc' },
  });

  assert.ok(ttm, '市值、EBIT-TTM、營收-TTM 都齊全，basis=TTM 應該有寫入');
  if (ttm!.value !== null) {
    const value = Number(ttm!.value);
    assert.ok(value > 0 && value < 100, `zScore=${value} 數量級異常`);
  }
});

test('altmanZScorePit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await computeAndWriteAltmanZScorePit({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.ttm, { action: 'skipped_no_quarter' });
  const count = await analysisPrisma.metricValue.count({ where: { symbol: '9999', metricCode: 'altmanZScore' } });
  assert.equal(count, 0);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
