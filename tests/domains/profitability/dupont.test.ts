import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { calculateDupont } from '@/domains/profitability/dupont/service';
import prisma from '@/adapters/prisma/index';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// 對照 src/domains/profitability/README.md「杜邦分析法計算口徑」——2330（台積電）115Q2 合併報表實測值。
// 複合指標，直接引用 margins/、turnoverRatio/、roe/ 的數值，這裡順便驗證組裝邏輯本身沒錯
// （decomposedRoe = netProfitMargin x assetTurnover x equityMultiplier）。
// decomposedRoeQuarterlyPct/TtmPct 跟 actualRoeQuarterlyPct/TtmPct 理論上應該接近但不必完全相等——
// 差異來自 assetTurnover 等中間值四捨五入到小數點後 2~4 位造成的正常誤差，尤其單季週轉率本身數值
// 較小（0.14），四捨五入造成的相對誤差會被放大，屬預期現象。
test('dupont: 2330 115Q2 合併報表', async () => {
  const result = await calculateDupont({ companyId: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.netProfitMarginQuarterly, 55.62);
  assert.equal(result.netProfitMarginTtm, 50.38);
  assert.equal(result.assetTurnoverQuarterly, 0.14);
  assert.equal(result.assetTurnoverTtm, 0.47);
  assert.equal(result.equityMultiplier, 1.46);
  assert.equal(result.decomposedRoeQuarterlyPct, 11.37);
  assert.equal(result.decomposedRoeTtmPct, 34.57);
  assert.equal(result.actualRoeQuarterlyPct, 10.98);
  assert.equal(result.actualRoeTtmPct, 34.78);
  assert.equal(result.totalAssets.value, '9375654727');
  assert.equal(result.equity.fieldUsed, 'equityAttributableToParent');
  assert.equal(result.equity.value, '6432518334');
  assert.deepEqual(result.fieldStatuses, {});
  assert.deepEqual(result.warnings, []);
});

// 1101（台泥）115Q2 合併報表在 margins/turnoverRatio/roe 三個底層服務都查無資料
// （沿用其他測試檔案裡驗證過的「無資料公司」案例），用來驗證杜邦分析在底層資料缺漏時
// 能優雅降級：所有欄位回 null、fieldStatuses 標明 no_data、warnings 有人類可讀說明。
test('dupont: 1101 115Q2 合併報表（底層資料缺漏，優雅降級）', async () => {
  const result = await calculateDupont({ companyId: '1101', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.netProfitMarginQuarterly, null);
  assert.equal(result.assetTurnoverQuarterly, null);
  assert.equal(result.equityMultiplier, null);
  assert.equal(result.decomposedRoeQuarterlyPct, null);
  assert.equal(result.decomposedRoeTtmPct, null);
  assert.equal(result.fieldStatuses.netProfitMargin?.status, 'no_data');
  assert.equal(result.fieldStatuses.assetTurnover?.status, 'no_data');
  assert.equal(result.fieldStatuses.equityMultiplier?.status, 'no_data');
  assert.ok(result.warnings.length > 0);
});

// 2026-08-28 新增：year/season 不給時自動抓最新一季，跟指定最新季度結果應該一致。
test('dupont: 2330 不指定 year/season 時自動抓最新一季，結果應該跟指定最新季度一致', async () => {
  const explicit = await calculateDupont({ companyId: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });
  const auto = await calculateDupont({ companyId: '2330', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(auto.year, explicit.year);
  assert.equal(auto.season, explicit.season);
  assert.equal(auto.decomposedRoeQuarterlyPct, explicit.decomposedRoeQuarterlyPct);
});

// 完全查無資料的公司，自動抓最新一季應該優雅降級，不是丟例外。
test('dupont: 9999（查無資料的公司）自動抓最新一季應該回傳 year/season 為 null 的優雅降級結果', async () => {
  const result = await calculateDupont({ companyId: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.year, null);
  assert.equal(result.season, null);
  assert.equal(result.decomposedRoeQuarterlyPct, null);
  assert.ok(result.warnings.length > 0);
});

after(async () => {
  await prisma.$disconnect();
  await analysisPrisma.$disconnect();
});
