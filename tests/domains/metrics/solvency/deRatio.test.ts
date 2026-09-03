import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { calculateDeRatio } from '@/domains/metrics/solvency/deRatio/service';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// 對照 2330 115Q2 合併報表實測值。
test('deRatio: 2330 115Q2 合併報表，指定季度', async () => {
  const result = await calculateDeRatio({ companyId: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.deRatioPct, 13.44);
  assert.deepEqual(result.warnings, []);
});

// 2026-08-28 新增：year/season 不給時自動抓最新一季，跟指定最新季度結果應該一致。
test('deRatio: 2330 不指定 year/season 時自動抓最新一季，結果應該跟指定最新季度一致', async () => {
  const explicit = await calculateDeRatio({ companyId: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });
  const auto = await calculateDeRatio({ companyId: '2330', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(auto.year, explicit.year);
  assert.equal(auto.season, explicit.season);
  assert.equal(auto.deRatioPct, explicit.deRatioPct);
});

// deRatio 只需要資產負債表一張表，自動抓最新一季應該直接取資產負債表自己的最新一季（115Q1，
// 2887 損益表雖然卡在 114Q2，但這支指標根本不查損益表，不受影響）。
test('deRatio: 2887 自動抓最新一季應該取資產負債表自己的最新一季（115Q1）', async () => {
  const auto = await calculateDeRatio({ companyId: '2887', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(auto.year, '115');
  assert.equal(auto.season, '1');
  assert.notEqual(auto.deRatioPct, null, '115Q1 資產負債表有資料，應該算得出來');
});

// 完全查無資料的公司，自動抓最新一季應該優雅降級，不是丟例外。
test('deRatio: 9999（查無資料的公司）自動抓最新一季應該回傳 year/season 為 null 的優雅降級結果', async () => {
  const result = await calculateDeRatio({ companyId: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.year, null);
  assert.equal(result.season, null);
  assert.equal(result.deRatioPct, null);
  assert.ok(result.warnings.length > 0);
});

after(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
