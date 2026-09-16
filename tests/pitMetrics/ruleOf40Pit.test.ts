import { test, afterAll, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { computeAndWriteRuleOf40Pit } from '@/bootstrap/pitMetrics';
import { upsertMetricDefinition, metricDefinitionRegistry } from '@/application/metrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '@/infrastructure/prisma/mopsExportClient';
import { twseExportPrisma } from '@/infrastructure/prisma/twseExportClient';
import { tpexExportPrisma } from '@/infrastructure/prisma/tpexExportClient';
import { analysisPrisma } from '@/infrastructure/prisma/analysisClient';

// Rule of 40 = 營收成長率(TTM vs 去年同期TTM) + FCF利潤率(TTM)，只適用軟體/SaaS 商業模式
// （twse-ts industry='30'資訊服務業/'36'數位雲端），實測 2026-09-14 全市場掃描確認
// 3130（一零四資訊科技）115Q2 有完整 8 季資料可算出真實數字，用這組當基準值交叉驗證。

beforeAll(async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.ruleOf40!);
});

test('ruleOf40Pit: 3130（資訊服務業）115Q2，跟實測基準數字交叉驗證', async () => {
  await computeAndWriteRuleOf40Pit({ symbol: '3130', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const ttm = await analysisPrisma.metricValue.findFirst({
    where: { symbol: '3130', metricCode: 'ruleOf40', periodType: 'TTM', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' },
    orderBy: { knowledgeDate: 'desc' },
  });

  assert.ok(ttm, 'basis=TTM 應該有寫入');
  assert.equal(Number(ttm!.value), 35.33);
  assert.equal(ttm!.nullReason, null);
});

test('ruleOf40Pit: 2330（非資訊服務業/數位雲端）應該優雅降級，不寫入任何列', async () => {
  const outcome = await computeAndWriteRuleOf40Pit({ symbol: '2330', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.ttm, { action: 'skipped_no_quarter' });
  const count = await analysisPrisma.metricValue.count({ where: { symbol: '2330', metricCode: 'ruleOf40' } });
  assert.equal(count, 0);
});

test('ruleOf40Pit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await computeAndWriteRuleOf40Pit({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.ttm, { action: 'skipped_no_quarter' });
  const count = await analysisPrisma.metricValue.count({ where: { symbol: '9999', metricCode: 'ruleOf40' } });
  assert.equal(count, 0);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await twseExportPrisma.$disconnect();
  await tpexExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
