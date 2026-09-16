import { test, afterAll, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { computeAndWriteLeverageDegreeFamilyPit } from '@/application/metrics/resilience/leverageDegreeFamily/computeLeverageDegreeFamilyPit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '@/application/metrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '@/infrastructure/prisma/mopsExportClient';
import { analysisPrisma } from '@/infrastructure/prisma/analysisClient';

// 「全市場六季財報深度解鎖的指標」批次——財務槓桿度(DFL)/總槓桿度(DTL)，YoY（本季 vs
// 去年同季），只需要 5 季。用 2330 真實資料驗證。

const CODES = ['financialLeverageDegree', 'totalLeverageDegree'];

beforeAll(async () => {
  await Promise.all(CODES.map((code) => upsertMetricDefinition(metricDefinitionRegistry[code]!)));
});

test('leverageDegreeFamilyPit: 2330 DFL/DTL 都應該算出非 null 的 Q 值', async () => {
  const outcome = await computeAndWriteLeverageDegreeFamilyPit({ symbol: '2330', dataType: '2', subsidiaryCompanyId: '' });
  assert.notEqual(outcome.rocYear, null);

  const rows = await analysisPrisma.metricValue.findMany({
    where: { symbol: '2330', metricCode: { in: CODES }, periodType: 'Q' },
    orderBy: { knowledgeDate: 'desc' },
  });
  const byCode = new Map(rows.map((r) => [r.metricCode, r]));

  for (const code of CODES) {
    const row = byCode.get(code);
    assert.ok(row, `${code} 應該有寫入`);
    assert.ok(row!.value !== null, `2330 資料完整，${code} 不應該是 null`);
  }
});

test('leverageDegreeFamilyPit: 重跑同一季，去重邏輯應該讓第二次 skipped_unchanged', async () => {
  const query = { symbol: '2330', dataType: '2' as const, subsidiaryCompanyId: '' };
  await computeAndWriteLeverageDegreeFamilyPit(query);
  const second = await computeAndWriteLeverageDegreeFamilyPit(query);
  assert.deepEqual(second.financialLeverageDegree, { action: 'skipped_unchanged' });
  assert.deepEqual(second.totalLeverageDegree, { action: 'skipped_unchanged' });
});

test('leverageDegreeFamilyPit: 9999（查無資料的公司）應該優雅降級', async () => {
  const outcome = await computeAndWriteLeverageDegreeFamilyPit({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });
  assert.equal(outcome.rocYear, null);
  assert.deepEqual(outcome.financialLeverageDegree, { action: 'skipped_no_quarter' });
  assert.deepEqual(outcome.totalLeverageDegree, { action: 'skipped_no_quarter' });
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
