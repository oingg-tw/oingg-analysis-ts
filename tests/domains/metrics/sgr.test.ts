import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { calculateSgr } from '@/domainMetrics/sgr';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// 對照 src/domainMetrics/profitability.md「配息率／SGR 計算口徑」——2330（台積電）115Q2 合併報表實測值。
// 複合指標，直接引用 roe/、dividendPayoutRatio/ 的 TTM 數值，這裡順便驗證組裝邏輯本身沒錯
// （sgrTtm = roeTtm x (1 - payoutRatioTtm/100)）。
// 2026-08-27 更新：見 dividendPayoutRatio.test.ts 開頭註解，mops 現金流量表修正後 TTM 數字改變。
test('sgr: 2330 115Q2 合併報表（只有 TTM 口徑）', async () => {
  const result = await calculateSgr({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.roeTtm.value, 34.78);
  assert.equal(result.payoutRatioTtm.value, 23.76);
  assert.equal(result.sgrTtm, 26.52);
  assert.deepEqual(result.warnings, []);
});

// 2026-08-28 新增：year/season 不給時自動抓最新一季，跟指定最新季度結果應該一致。
test('sgr: 2330 不指定 year/season 時自動抓最新一季，結果應該跟指定最新季度一致', async () => {
  const explicit = await calculateSgr({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });
  const auto = await calculateSgr({ symbol: '2330', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(auto.year, explicit.year);
  assert.equal(auto.season, explicit.season);
  assert.equal(auto.sgrTtm, explicit.sgrTtm);
});

// 完全查無資料的公司，自動抓最新一季應該優雅降級，不是丟例外。
test('sgr: 9999（查無資料的公司）自動抓最新一季應該回傳 year/season 為 null 的優雅降級結果', async () => {
  const result = await calculateSgr({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.year, null);
  assert.equal(result.season, null);
  assert.equal(result.sgrTtm, null);
  assert.ok(result.warnings.length > 0);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
