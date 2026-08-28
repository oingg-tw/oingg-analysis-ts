import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { calculateRoa } from '@/domains/profitability/roa/service';
import { getLatestAvailableQuarter } from '@/shared/latestQuarter';
import prisma from '@/adapters/prisma/index';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// 對照 2330 115Q2 合併報表實測值。
test('roa: 2330 115Q2 合併報表，指定季度', async () => {
  const result = await calculateRoa({ companyId: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.roaQuarterlyPct, 7.54);
  assert.equal(result.roaQuarterlyAnnualizedPct, 30.16);
  assert.equal(result.roaTtmPct, 23.86);
  assert.deepEqual(result.ttm.quartersMissing, []);
  assert.deepEqual(result.warnings, []);
});

// year/season 不給時自動抓最新一季，跟指定最新季度結果應該一致。
test('roa: 2330 不指定 year/season 時自動抓最新一季，結果應該跟指定最新季度一致', async () => {
  const explicit = await calculateRoa({ companyId: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });
  const auto = await calculateRoa({ companyId: '2330', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(auto.year, explicit.year);
  assert.equal(auto.season, explicit.season);
  assert.equal(auto.roaQuarterlyPct, explicit.roaQuarterlyPct);
});

// 關鍵案例：2887 資產負債表/損益表申報進度曾經不同步（實測驗證過），自動抓最新一季必須取
// 「資產負債表跟損益表都有資料」的交集，不能只看資產負債表最新一季——否則會誤判成有資料，
// 實際上那一季損益表是空的，一樣算不出來。不寫死季度數字（mops 資料持續在補，落差會隨時間
// 縮小甚至消失）：改成直接拿 getLatestAvailableQuarter 對同一組 sources 現查現算的結果當期望值。
test('roa: 自動抓最新一季應該取資產負債表/損益表都有資料的交集，不是任一張表自己的最新一季', async () => {
  const expected = await getLatestAvailableQuarter('2887', '2', '', ['balanceSheet', 'incomeStatement']);
  const auto = await calculateRoa({ companyId: '2887', dataType: '2', subsidiaryCompanyId: '' });

  assert.ok(expected, '2887 應該至少有一季資產負債表跟損益表都有資料');
  assert.equal(auto.year, expected!.year);
  assert.equal(auto.season, expected!.season);
});

// 完全查無資料的公司，自動抓最新一季應該優雅降級，不是丟例外。
test('roa: 9999（查無資料的公司）自動抓最新一季應該回傳 year/season 為 null 的優雅降級結果', async () => {
  const result = await calculateRoa({ companyId: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.year, null);
  assert.equal(result.season, null);
  assert.equal(result.roaQuarterlyPct, null);
  assert.ok(result.warnings.length > 0);
});

after(async () => {
  await prisma.$disconnect();
  await analysisPrisma.$disconnect();
});
