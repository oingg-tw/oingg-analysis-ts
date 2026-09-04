import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { calculateRoe } from '@/domainBatch/metrics/profitability/roe/service';
import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// 對照 2330 115Q2 合併報表實測值。
test('roe: 2330 115Q2 合併報表，指定季度', async () => {
  const result = await calculateRoe({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.roeQuarterlyPct, 10.98);
  assert.equal(result.roeTtmPct, 34.78);
  assert.deepEqual(result.ttm.quartersMissing, []);
  assert.deepEqual(result.warnings, []);
});

// 2026-08-28 新增：year/season 不給時自動抓最新一季，跟指定最新季度結果應該一致。
test('roe: 2330 不指定 year/season 時自動抓最新一季，結果應該跟指定最新季度一致', async () => {
  const explicit = await calculateRoe({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });
  const auto = await calculateRoe({ symbol: '2330', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(auto.year, explicit.year);
  assert.equal(auto.season, explicit.season);
  assert.equal(auto.roeQuarterlyPct, explicit.roeQuarterlyPct);
});

// 關鍵案例：2887 資產負債表/損益表申報進度曾經不同步（實測驗證過，2026-08-28 當下損益表卡在
// 114Q2、資產負債表已到 115Q1）。自動抓最新一季必須取「資產負債表跟損益表都有資料」的交集，
// 不能只看資產負債表最新一季——否則會誤判成有資料，實際上那一季損益表是空的，一樣算不出來。
// 不寫死季度數字（mops 資料持續在補，落差會隨時間縮小甚至消失）：改成直接拿 getLatestAvailableQuarter
// 對同一組 sources 現查現算的結果當期望值，驗證的是「服務有沒有正確用交集」，不是凍結某天的快照。
test('roe: 自動抓最新一季應該取資產負債表/損益表都有資料的交集，不是任一張表自己的最新一季', async () => {
  const expected = await getLatestAvailableQuarter('2887', '2', '', ['balanceSheet', 'incomeStatement']);
  const auto = await calculateRoe({ symbol: '2887', dataType: '2', subsidiaryCompanyId: '' });

  assert.ok(expected, '2887 應該至少有一季資產負債表跟損益表都有資料');
  assert.equal(auto.year, expected!.year);
  assert.equal(auto.season, expected!.season);
});

// 完全查無資料的公司，自動抓最新一季應該優雅降級，不是丟例外。
test('roe: 9999（查無資料的公司）自動抓最新一季應該回傳 year/season 為 null 的優雅降級結果', async () => {
  const result = await calculateRoe({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.year, null);
  assert.equal(result.season, null);
  assert.equal(result.roeQuarterlyPct, null);
  assert.ok(result.warnings.length > 0);
});

after(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
