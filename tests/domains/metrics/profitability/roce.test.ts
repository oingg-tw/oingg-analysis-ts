import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { calculateRoce } from '@/domainBatch/metrics/profitability/roce/service';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// 對照 src/domainBatch/metrics/profitability/README.md「ROIC/ROCE 計算口徑」——2330（台積電）115Q2 合併報表實測值。
// 2026-08-27 更新：見 turnoverRatio.test.ts 開頭註解，mops Q4 資料修正後 TTM 系列數字改變。
test('roce: 2330 115Q2 合併報表', async () => {
  const result = await calculateRoce({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.roceQuarterlyPct, 11.51);
  assert.equal(result.roceQuarterlyAnnualizedPct, 46.04);
  assert.equal(result.roceTtmPct, 35.65);
  assert.equal(result.ebit.value, '865515135');
  assert.equal(result.ebitTtm.value, '2679765926');
  assert.equal(result.capitalEmployed.value, '7517892902');
  assert.deepEqual(result.warnings, []);
});

// 2026-08-28 新增：year/season 不給時自動抓最新一季，跟指定最新季度結果應該一致。
test('roce: 2330 不指定 year/season 時自動抓最新一季，結果應該跟指定最新季度一致', async () => {
  const explicit = await calculateRoce({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });
  const auto = await calculateRoce({ symbol: '2330', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(auto.year, explicit.year);
  assert.equal(auto.season, explicit.season);
  assert.equal(auto.roceQuarterlyPct, explicit.roceQuarterlyPct);
});

// 完全查無資料的公司，自動抓最新一季應該優雅降級，不是丟例外。
test('roce: 9999（查無資料的公司）自動抓最新一季應該回傳 year/season 為 null 的優雅降級結果', async () => {
  const result = await calculateRoce({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.year, null);
  assert.equal(result.season, null);
  assert.equal(result.roceQuarterlyPct, null);
  assert.ok(result.warnings.length > 0);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
