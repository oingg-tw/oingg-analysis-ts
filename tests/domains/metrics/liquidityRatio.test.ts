import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { calculateLiquidityRatio } from '@/domainMetrics/liquidityRatio';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// 對照 2330 115Q2 合併報表實測值。
test('liquidityRatio: 2330 115Q2 合併報表，指定季度', async () => {
  const result = await calculateLiquidityRatio({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.currentRatioPct, 245.76);
  assert.equal(result.quickRatioPct, 225.01);
  assert.equal(result.cashRatioPct, 168.71);
  assert.deepEqual(result.warnings, []);
});

// 2026-08-28 新增：year/season 不給時自動抓最新一季，跟指定最新季度結果應該一致。
test('liquidityRatio: 2330 不指定 year/season 時自動抓最新一季，結果應該跟指定最新季度一致', async () => {
  const explicit = await calculateLiquidityRatio({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });
  const auto = await calculateLiquidityRatio({ symbol: '2330', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(auto.year, explicit.year);
  assert.equal(auto.season, explicit.season);
  assert.equal(auto.currentRatioPct, explicit.currentRatioPct);
});

// liquidityRatio 只需要資產負債表一張表，自動抓最新一季應該直接取資產負債表自己的最新一季（115Q1）。
// 2887 這一季流動資產/流動負債/存貨欄位剛好都是 null（實測驗證過的真實資料狀況），三個比率都算不出來，
// 但這是資料缺漏，不是自動抓季度的邏輯錯誤——重點在確認季度真的取到 115Q1。
test('liquidityRatio: 2887 自動抓最新一季應該取資產負債表自己的最新一季（115Q1）', async () => {
  const auto = await calculateLiquidityRatio({ symbol: '2887', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(auto.year, '115');
  assert.equal(auto.season, '1');
  assert.notEqual(auto.cashAndEquivalents.value, null, '115Q1 資產負債表有資料（現金及約當現金欄位非 null）');
});

// 完全查無資料的公司，自動抓最新一季應該優雅降級，不是丟例外。
test('liquidityRatio: 9999（查無資料的公司）自動抓最新一季應該回傳 year/season 為 null 的優雅降級結果', async () => {
  const result = await calculateLiquidityRatio({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.year, null);
  assert.equal(result.season, null);
  assert.equal(result.currentRatioPct, null);
  assert.ok(result.warnings.length > 0);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
