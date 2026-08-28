import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { calculateTurnoverRatio } from '@/domains/turnover/turnoverRatio/service';
import prisma from '@/adapters/prisma/index';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// 對照 src/domains/turnover/README.md「DIO/DSO/DPO/CCC 計算口徑」——2330（台積電）115Q2 合併報表實測值。
// 2026-08-27 更新：oingg-mops-ts 把 quarterly_income_statement 的 Q4（原本存的是全年累計數，
// 不是單季數）修正成真的單季數，TTM 系列數字（跨到 114Q4 的窗口）全部改變，本季（單季）數字不受影響。
test('turnoverRatio: 2330 115Q2 合併報表——五個周轉率、DIO/DSO/DPO/CCC', async () => {
  const result = await calculateTurnoverRatio({ companyId: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.inventoryTurnoverQuarterly, 1.06);
  assert.equal(result.inventoryTurnoverQuarterlyAnnualized, 4.24);
  assert.equal(result.inventoryTurnoverTtm, 4.12);

  assert.equal(result.receivablesTurnoverQuarterly, 2.92);
  assert.equal(result.receivablesTurnoverQuarterlyAnnualized, 11.68);
  assert.equal(result.receivablesTurnoverTtm, 10.19);

  assert.equal(result.assetTurnoverQuarterly, 0.14);
  assert.equal(result.assetTurnoverQuarterlyAnnualized, 0.56);
  assert.equal(result.assetTurnoverTtm, 0.47);

  assert.equal(result.fixedAssetTurnoverQuarterly, 0.3);
  assert.equal(result.fixedAssetTurnoverQuarterlyAnnualized, 1.2);
  assert.equal(result.fixedAssetTurnoverTtm, 1.03);

  assert.equal(result.payablesTurnoverQuarterly, 3.77);
  assert.equal(result.payablesTurnoverQuarterlyAnnualized, 15.08);
  assert.equal(result.payablesTurnoverTtm, 14.59);

  assert.equal(result.inventoryDaysQuarterlyAnnualized, 86.08);
  assert.equal(result.inventoryDaysTtm, 88.59);
  assert.equal(result.receivablesDaysQuarterlyAnnualized, 31.25);
  assert.equal(result.receivablesDaysTtm, 35.82);
  assert.equal(result.payablesDaysQuarterlyAnnualized, 24.2);
  assert.equal(result.payablesDaysTtm, 25.02);

  assert.equal(result.cashConversionCycleQuarterlyAnnualized, 93.13);
  assert.equal(result.cashConversionCycleTtm, 99.39);

  assert.deepEqual(result.warnings, []);
});

// 2026-08-28 新增：year/season 不給時自動抓最新一季，跟指定最新季度結果應該一致。
test('turnoverRatio: 2330 不指定 year/season 時自動抓最新一季，結果應該跟指定最新季度一致', async () => {
  const explicit = await calculateTurnoverRatio({ companyId: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });
  const auto = await calculateTurnoverRatio({ companyId: '2330', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(auto.year, explicit.year);
  assert.equal(auto.season, explicit.season);
  assert.equal(auto.assetTurnoverQuarterly, explicit.assetTurnoverQuarterly);
});

// 完全查無資料的公司，自動抓最新一季應該優雅降級，不是丟例外。
test('turnoverRatio: 9999（查無資料的公司）自動抓最新一季應該回傳 year/season 為 null 的優雅降級結果', async () => {
  const result = await calculateTurnoverRatio({ companyId: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.year, null);
  assert.equal(result.season, null);
  assert.equal(result.assetTurnoverQuarterly, null);
  assert.ok(result.warnings.length > 0);
});

after(async () => {
  await prisma.$disconnect();
  await analysisPrisma.$disconnect();
});
