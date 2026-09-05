import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { calculateAccrualsRatio } from '@/domainMetrics/accrualsRatio';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// 2330（台積電）115Q2 合併報表實測值。
test('accrualsRatio: 2330 115Q2 合併報表', async () => {
  const result = await calculateAccrualsRatio({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.accrualsRatioQuarterly, 4.44);
  assert.equal(result.accrualsRatioQuarterlyAnnualized, 17.76);
  assert.equal(result.accrualsRatioTtm, 11.5);
  assert.deepEqual(result.warnings, []);
});

// 2026-08-28 新增：year/season 不給時自動抓最新一季，跟指定最新季度結果應該一致。
test('accrualsRatio: 2330 不指定 year/season 時自動抓最新一季，結果應該跟指定最新季度一致', async () => {
  const explicit = await calculateAccrualsRatio({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });
  const auto = await calculateAccrualsRatio({ symbol: '2330', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(auto.year, explicit.year);
  assert.equal(auto.season, explicit.season);
  assert.equal(auto.accrualsRatioQuarterly, explicit.accrualsRatioQuarterly);
});

// 完全查無資料的公司，自動抓最新一季應該優雅降級，不是丟例外。
test('accrualsRatio: 9999（查無資料的公司）自動抓最新一季應該回傳 year/season 為 null 的優雅降級結果', async () => {
  const result = await calculateAccrualsRatio({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.year, null);
  assert.equal(result.season, null);
  assert.equal(result.accrualsRatioQuarterly, null);
  assert.ok(result.warnings.length > 0);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
