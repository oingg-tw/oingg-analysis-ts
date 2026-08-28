import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { calculateRevenuePerShare } from '@/domains/profitability/revenuePerShare/service';
import { getLatestAvailableQuarter } from '@/shared/latestQuarter';
import prisma from '@/adapters/prisma/index';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// 對照 2330 115Q2 合併報表實測值。
test('revenuePerShare: 2330 115Q2 合併報表，指定季度', async () => {
  const result = await calculateRevenuePerShare({ companyId: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.revenuePerShareQuarterly, 48.99);
  assert.equal(result.revenuePerShareQuarterlyAnnualized, 195.96);
  assert.equal(result.revenuePerShareTtm, 171.23);
  assert.deepEqual(result.ttm.quartersMissing, []);
  assert.deepEqual(result.warnings, []);
});

// year/season 不給時自動抓最新一季，跟指定最新季度結果應該一致。
test('revenuePerShare: 2330 不指定 year/season 時自動抓最新一季，結果應該跟指定最新季度一致', async () => {
  const explicit = await calculateRevenuePerShare({ companyId: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });
  const auto = await calculateRevenuePerShare({ companyId: '2330', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(auto.year, explicit.year);
  assert.equal(auto.season, explicit.season);
  assert.equal(auto.revenuePerShareQuarterly, explicit.revenuePerShareQuarterly);
});

// 每股營收只需要損益表這一張表（sources: ['incomeStatement']）——不寫死季度數字（mops 資料持續在補），
// 改成直接拿 getLatestAvailableQuarter 對同一組 sources 現查現算的結果當期望值，驗證的是「每股營收
// 不會誤看資產負債表」這件事，不是凍結某天的快照。
test('revenuePerShare: 自動抓最新一季應該直接是損益表自己的最新一季，不受資產負債表影響', async () => {
  const expected = await getLatestAvailableQuarter('2887', '2', '', ['incomeStatement']);
  const auto = await calculateRevenuePerShare({ companyId: '2887', dataType: '2', subsidiaryCompanyId: '' });

  assert.ok(expected, '2887 應該至少有一季損益表資料');
  assert.equal(auto.year, expected!.year);
  assert.equal(auto.season, expected!.season);
});

// 完全查無資料的公司，自動抓最新一季應該優雅降級，不是丟例外。
test('revenuePerShare: 9999（查無資料的公司）自動抓最新一季應該回傳 year/season 為 null 的優雅降級結果', async () => {
  const result = await calculateRevenuePerShare({ companyId: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.year, null);
  assert.equal(result.season, null);
  assert.equal(result.revenuePerShareQuarterly, null);
  assert.ok(result.warnings.length > 0);
});

after(async () => {
  await prisma.$disconnect();
  await analysisPrisma.$disconnect();
});
