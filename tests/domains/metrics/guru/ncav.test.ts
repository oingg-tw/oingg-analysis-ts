import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { calculateNcav } from '@/domainMetrics/guru/ncav/service';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// 對照 2330 115Q2 合併報表實測值。
test('ncav: 2330 115Q2 合併報表，指定季度', async () => {
  const result = await calculateNcav({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.ncav, 64.19);
  assert.equal(result.marginOfSafetyPrice, 42.79);
  assert.equal(result.currentAssets.value, '4565700742');
  assert.equal(result.totalLiabilities.value, '2901183746');
  assert.equal(result.paidInShares.value, '25932370067');
  assert.deepEqual(result.warnings, []);
});

// 2026-08-28 新增：year/season 不給時自動抓最新一季，跟指定最新季度結果應該一致。
test('ncav: 2330 不指定 year/season 時自動抓最新一季，結果應該跟指定最新季度一致', async () => {
  const explicit = await calculateNcav({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });
  const auto = await calculateNcav({ symbol: '2330', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(auto.year, explicit.year);
  assert.equal(auto.season, explicit.season);
  assert.equal(auto.ncav, explicit.ncav);
});

// ncav 只需要資產負債表一張表（sources: ['balanceSheet']），跟 roe/grahamNumber 那種需要資產負債表
// 跟損益表交集的指標不一樣——這裡自動抓最新一季應該直接等於資產負債表自己的最新一季（115Q1，
// 實測驗證過的），不需要（也不會）因為損益表卡在 114Q2 而被拖慢，這是跟 roe.test.ts 的 2887
// 案例互補的對照組：sources 只有一張表時，交集就是那張表自己的最新一季。
test('ncav: 2887 自動抓最新一季應該直接等於資產負債表自己的最新一季（115Q1），不需要跟損益表交集', async () => {
  const auto = await calculateNcav({ symbol: '2887', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(auto.year, '115');
  assert.equal(auto.season, '1');
  // 2887 這一季資產負債表本身有資料（reportDate 非 null），但流動資產欄位是 null（金融/保險業
  // 不採流動/非流動分類），NCAV 算不出來是這家公司的公式適用性問題，不是季度解析錯誤。
  assert.equal(auto.reportDate, '2026-03-31');
  assert.equal(auto.ncav, null);
  assert.ok(auto.warnings.length > 0);
});

// 完全查無資料的公司，自動抓最新一季應該優雅降級，不是丟例外。
test('ncav: 9999（查無資料的公司）自動抓最新一季應該回傳 year/season 為 null 的優雅降級結果', async () => {
  const result = await calculateNcav({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.year, null);
  assert.equal(result.season, null);
  assert.equal(result.ncav, null);
  assert.ok(result.warnings.length > 0);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
