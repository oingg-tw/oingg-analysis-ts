import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { calculateBvps } from '@/domainMetrics/bvps/service';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// 對照 2330 115Q2 合併報表實測值。
test('bvps: 2330 115Q2 合併報表，指定季度', async () => {
  const result = await calculateBvps({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.bvps, 248.05);
  assert.equal(result.equity.value, '6432518334');
  assert.equal(result.paidInShares.value, '25932370067');
  assert.deepEqual(result.warnings, []);
});

// year/season 不給時自動抓最新一季，跟指定最新季度結果應該一致。
test('bvps: 2330 不指定 year/season 時自動抓最新一季，結果應該跟指定最新季度一致', async () => {
  const explicit = await calculateBvps({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });
  const auto = await calculateBvps({ symbol: '2330', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(auto.year, explicit.year);
  assert.equal(auto.season, explicit.season);
  assert.equal(auto.bvps, explicit.bvps);
});

// BVPS 只需要資產負債表這一張表（sources: ['balanceSheet']），跟 ROA/ROE 這種需要資產負債表+損益表
// 兩張表交集的指標不同——2887 損益表卡在 114Q2，但資產負債表已經到 115Q1，BVPS 不受損益表落後拖累，
// 應該直接抓資產負債表自己的最新一季（115Q1），不是像 roa/roe 那樣被拉回 114Q2。
test('bvps: 2887 只依賴資產負債表，自動抓最新一季應該直接是資產負債表自己的最新一季（115Q1），不受損益表落後影響', async () => {
  const auto = await calculateBvps({ symbol: '2887', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(auto.year, '115');
  assert.equal(auto.season, '1');
  assert.notEqual(auto.equity.value, null, '115Q1 資產負債表應該有資料');
});

// 完全查無資料的公司，自動抓最新一季應該優雅降級，不是丟例外。
test('bvps: 9999（查無資料的公司）自動抓最新一季應該回傳 year/season 為 null 的優雅降級結果', async () => {
  const result = await calculateBvps({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.year, null);
  assert.equal(result.season, null);
  assert.equal(result.bvps, null);
  assert.ok(result.warnings.length > 0);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
