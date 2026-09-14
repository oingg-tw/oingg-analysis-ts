import { test, afterAll, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { computeAndWriteShareholderYieldPit } from '@/domainPitMetrics/dividend/shareholderYield/computeShareholderYieldPit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '@/domainPitMetrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { twseExportPrisma } from '@/adapters/prisma/twseExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// Shareholder Yield（Mebane Faber, 2013）= 股利殖利率 + 買回殖利率，獨立重新計算不依賴
// dividendYield/buybackYield 已寫入的值。實測 2026-09-14 確認 2330（沒有庫藏股買回）算出
// 來的值（0.85%）跟同一天的 dividendYield（EOD 0.91%）數量級一致，兩支指標本來就不是同一個
// 口徑（一個 EOD 交易所快照、一個 TTM 現金流量表加總），數字接近但不要求完全相等。

beforeAll(async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.shareholderYield!);
});

test('shareholderYieldPit: 2330 115Q2，數字在合理範圍內（跟同期 dividendYield 數量級一致）', async () => {
  await computeAndWriteShareholderYieldPit({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const ttm = await analysisPrisma.metricValue.findFirst({
    where: { symbol: '2330', metricCode: 'shareholderYield', periodType: 'TTM', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' },
    orderBy: { knowledgeDate: 'desc' },
  });

  assert.ok(ttm, 'basis=TTM 應該有寫入');
  const value = Number(ttm!.value);
  assert.ok(value > 0 && value < 5, `2330 沒有庫藏股買回，股東總回饋率應該接近純股利殖利率的量級，實際值 ${value}`);
  assert.equal(ttm!.nullReason, null);
});

test('shareholderYieldPit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await computeAndWriteShareholderYieldPit({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.ttm, { action: 'skipped_no_quarter' });
  const count = await analysisPrisma.metricValue.count({ where: { symbol: '9999', metricCode: 'shareholderYield' } });
  assert.equal(count, 0);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await twseExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
