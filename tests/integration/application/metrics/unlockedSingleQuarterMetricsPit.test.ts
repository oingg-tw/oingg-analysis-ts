import { test, afterAll, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { computeAndWriteCashToAssetsRatioPit, computeAndWriteEquityRatioPit, computeAndWriteNonOperatingIncomeRatioPit } from '@/bootstrap/pitMetrics';
import { metricDefinitionRegistry } from '@/application/metrics/metricDefinitionRegistry';
import { upsertMetricDefinition } from '@/bootstrap/metricDefinitions';
import { mopsExportPrisma } from '@/infrastructure/prisma/mopsExportClient';
import { analysisPrisma } from '@/infrastructure/prisma/analysisClient';

// 「全市場六季財報深度解鎖的指標」批次——單季即可的三支獨立指標（不需要歷史深度，
// 純粹是先前沒做而已）。用 2330 真實資料驗證。

const CODES = ['nonOperatingIncomeRatio', 'equityRatio', 'cashToAssetsRatio'];

beforeAll(async () => {
  await Promise.all(CODES.map((code) => upsertMetricDefinition(metricDefinitionRegistry[code]!)));
});

test('nonOperatingIncomeRatioPit: 2330 應該算出非 null 的 Q 值', async () => {
  const outcome = await computeAndWriteNonOperatingIncomeRatioPit({ symbol: '2330', dataType: '2', subsidiaryCompanyId: '' });
  assert.notEqual(outcome.rocYear, null);
  const row = await analysisPrisma.metricValue.findFirst({ where: { symbol: '2330', metricCode: 'nonOperatingIncomeRatio', periodType: 'Q' }, orderBy: { knowledgeDate: 'desc' } });
  assert.ok(row);
  assert.ok(row!.value !== null);
});

test('equityRatioPit: 2330 應該落在 0~100% 合理範圍內', async () => {
  const outcome = await computeAndWriteEquityRatioPit({ symbol: '2330', dataType: '2', subsidiaryCompanyId: '' });
  assert.notEqual(outcome.rocYear, null);
  const row = await analysisPrisma.metricValue.findFirst({ where: { symbol: '2330', metricCode: 'equityRatio', periodType: 'Q' }, orderBy: { knowledgeDate: 'desc' } });
  assert.ok(row);
  const value = Number(row!.value);
  assert.ok(value > 0 && value < 100, `equityRatio 應該落在合理的 0~100% 範圍內，實際是 ${value}`);
});

test('cashToAssetsRatioPit: 2330 應該落在 0~100% 合理範圍內', async () => {
  const outcome = await computeAndWriteCashToAssetsRatioPit({ symbol: '2330', dataType: '2', subsidiaryCompanyId: '' });
  assert.notEqual(outcome.rocYear, null);
  const row = await analysisPrisma.metricValue.findFirst({ where: { symbol: '2330', metricCode: 'cashToAssetsRatio', periodType: 'Q' }, orderBy: { knowledgeDate: 'desc' } });
  assert.ok(row);
  const value = Number(row!.value);
  assert.ok(value > 0 && value < 100, `cashToAssetsRatio 應該落在合理的 0~100% 範圍內，實際是 ${value}`);
});

test('9999（查無資料的公司）三支都應該優雅降級', async () => {
  const query = { symbol: '9999', dataType: '2' as const, subsidiaryCompanyId: '' };
  const [a, b, c] = await Promise.all([
    computeAndWriteNonOperatingIncomeRatioPit(query),
    computeAndWriteEquityRatioPit(query),
    computeAndWriteCashToAssetsRatioPit(query),
  ]);
  assert.equal(a.rocYear, null);
  assert.equal(b.rocYear, null);
  assert.equal(c.rocYear, null);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
