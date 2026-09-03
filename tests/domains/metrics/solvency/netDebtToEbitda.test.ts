import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { calculateNetDebtToEbitda } from '@/domainApi/metrics/solvency/netDebtToEbitda/service';
import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// 對照 2330 115Q2 合併報表實測值。
test('netDebtToEbitda: 2330 115Q2 合併報表，指定季度', async () => {
  const result = await calculateNetDebtToEbitda({ companyId: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.netDebtToEbitdaQuarterlyAnnualized, -0.53);
  assert.equal(result.netDebtToEbitdaTtm, -0.67);
  assert.deepEqual(result.ttm.quartersMissing, []);
  assert.deepEqual(result.warnings, []);
});

// 2026-08-28 新增：year/season 不給時自動抓最新一季，跟指定最新季度結果應該一致。
test('netDebtToEbitda: 2330 不指定 year/season 時自動抓最新一季，結果應該跟指定最新季度一致', async () => {
  const explicit = await calculateNetDebtToEbitda({ companyId: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });
  const auto = await calculateNetDebtToEbitda({ companyId: '2330', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(auto.year, explicit.year);
  assert.equal(auto.season, explicit.season);
  assert.equal(auto.netDebtToEbitdaQuarterlyAnnualized, explicit.netDebtToEbitdaQuarterlyAnnualized);
});

// 關鍵案例：netDebtToEbitda 同時要用到資產負債表、損益表、現金流量表——不寫死季度數字（mops 資料
// 持續在補，2887 資產負債表/損益表的落差會隨時間縮小甚至消失），改成直接拿 getLatestAvailableQuarter
// 對同一組 sources 現查現算的結果當期望值，驗證的是三張表交集邏輯本身，不是凍結某天的快照。
test('netDebtToEbitda: 自動抓最新一季應該取三張表都有資料的交集，不是任一張表自己的最新一季', async () => {
  const expected = await getLatestAvailableQuarter('2887', '2', '', ['balanceSheet', 'incomeStatement', 'cashFlowStatement']);
  const auto = await calculateNetDebtToEbitda({ companyId: '2887', dataType: '2', subsidiaryCompanyId: '' });

  assert.ok(expected, '2887 應該至少有一季三張表都有資料');
  assert.equal(auto.year, expected!.year);
  assert.equal(auto.season, expected!.season);
  assert.notEqual(auto.netDebt.value, null, '交集出來的那一季資產負債表有資料，淨負債（有息負債-現金）應該算得出來');
});

// 完全查無資料的公司，自動抓最新一季應該優雅降級，不是丟例外。
test('netDebtToEbitda: 9999（查無資料的公司）自動抓最新一季應該回傳 year/season 為 null 的優雅降級結果', async () => {
  const result = await calculateNetDebtToEbitda({ companyId: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.year, null);
  assert.equal(result.season, null);
  assert.equal(result.netDebtToEbitdaTtm, null);
  assert.ok(result.warnings.length > 0);
});

after(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
