import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { calculateRoic } from '@/domainMetrics/profitability/roic/service';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// 對照 src/domainMetrics/profitability/README.md「ROIC/ROCE 計算口徑」——2330（台積電）115Q2 合併報表實測值。
// 2026-08-27 更新：見 turnoverRatio.test.ts 開頭註解，mops Q4 資料修正後 TTM 系列數字改變。
test('roic: 2330 115Q2 合併報表', async () => {
  const result = await calculateRoic({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.roicQuarterlyPct, 17.04);
  assert.equal(result.roicQuarterlyAnnualizedPct, 68.16);
  assert.equal(result.roicTtmPct, 53.97);
  assert.equal(result.nopat.value, '709309190');
  assert.equal(result.nopatTtm.value, '2246684545');
  assert.equal(result.investedCapital.value, '4162563795');
  assert.deepEqual(result.warnings, []);
});

// 2026-08-28 新增：year/season 不給時自動抓最新一季，跟指定最新季度結果應該一致。
test('roic: 2330 不指定 year/season 時自動抓最新一季，結果應該跟指定最新季度一致', async () => {
  const explicit = await calculateRoic({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });
  const auto = await calculateRoic({ symbol: '2330', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(auto.year, explicit.year);
  assert.equal(auto.season, explicit.season);
  assert.equal(auto.roicQuarterlyPct, explicit.roicQuarterlyPct);
});

// 完全查無資料的公司，自動抓最新一季應該優雅降級，不是丟例外。
test('roic: 9999（查無資料的公司）自動抓最新一季應該回傳 year/season 為 null 的優雅降級結果', async () => {
  const result = await calculateRoic({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.year, null);
  assert.equal(result.season, null);
  assert.equal(result.roicQuarterlyPct, null);
  assert.ok(result.warnings.length > 0);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
