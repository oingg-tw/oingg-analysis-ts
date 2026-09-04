import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { calculateGrahamNumber } from '@/domainBatch/metrics/guru/grahamNumber/service';
import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// 對照 2330 115Q2 合併報表實測值。
test('grahamNumber: 2330 115Q2 合併報表，指定季度', async () => {
  const result = await calculateGrahamNumber({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.grahamNumber, 693.89);
  assert.equal(result.epsTtm.value, 86.27);
  assert.equal(result.bvps.value, 248.05);
  assert.deepEqual(result.warnings, []);
});

// 2026-08-28 新增：year/season 不給時自動抓最新一季，跟指定最新季度結果應該一致。
test('grahamNumber: 2330 不指定 year/season 時自動抓最新一季，結果應該跟指定最新季度一致', async () => {
  const explicit = await calculateGrahamNumber({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });
  const auto = await calculateGrahamNumber({ symbol: '2330', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(auto.year, explicit.year);
  assert.equal(auto.season, explicit.season);
  assert.equal(auto.grahamNumber, explicit.grahamNumber);
});

// 關鍵案例：grahamNumber 的 sources 跟 roe 一樣是 ['balanceSheet', 'incomeStatement']（eps/bvps 兩個
// 組成指標需要的表的聯集）。不寫死季度數字（mops 資料持續在補，2887 資產負債表/損益表的落差會隨
// 時間縮小甚至消失，見 roe.test.ts）：改成直接拿 getLatestAvailableQuarter 對同一組 sources
// 現查現算的結果當期望值。grahamNumber 本身（epsTtm/bvps）是否為 null 是另一個獨立的資料缺口
// （例如缺 capital_stock_history），不影響「季度解析對不對」這件事本身的驗證，這裡不斷言。
test('grahamNumber: 自動抓最新一季應該取資產負債表/損益表都有資料的交集，不是任一張表自己的最新一季', async () => {
  const expected = await getLatestAvailableQuarter('2887', '2', '', ['balanceSheet', 'incomeStatement']);
  const auto = await calculateGrahamNumber({ symbol: '2887', dataType: '2', subsidiaryCompanyId: '' });

  assert.ok(expected, '2887 應該至少有一季資產負債表跟損益表都有資料');
  assert.equal(auto.year, expected!.year);
  assert.equal(auto.season, expected!.season);
});

// 完全查無資料的公司，自動抓最新一季應該優雅降級，不是丟例外。
test('grahamNumber: 9999（查無資料的公司）自動抓最新一季應該回傳 year/season 為 null 的優雅降級結果', async () => {
  const result = await calculateGrahamNumber({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.year, null);
  assert.equal(result.season, null);
  assert.equal(result.grahamNumber, null);
  assert.ok(result.warnings.length > 0);
});

after(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
