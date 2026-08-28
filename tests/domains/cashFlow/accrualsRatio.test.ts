import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { calculateAccrualsRatio } from '@/domains/cashFlow/accrualsRatio/service';
import prisma from '@/adapters/prisma/index';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// 2330（台積電）115Q2 合併報表實測值。
// 2026-08-27 更新：見 ocfToNetIncome.test.ts 開頭註解，mops 現金流量表修正後 OCF/ICF 本季數字都變了
// （totalAssets 來自資產負債表，本來就是單季時點快照，不受這次修正影響，數字不變）。
test('accrualsRatio: 2330 115Q2 合併報表', async () => {
  const result = await calculateAccrualsRatio({ companyId: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.accrualsRatioQuarterly, 4.44);
  assert.equal(result.accrualsRatioQuarterlyAnnualized, 17.76);
  assert.equal(result.accrualsRatioTtm, 11.5);
  assert.equal(result.netIncome.value, '706561938');
  assert.equal(result.operatingCashFlow.value, '783364977');
  assert.equal(result.investingCashFlow.value, '-492810418');
  assert.equal(result.totalAssets.value, '9375654727');
  assert.deepEqual(result.warnings, []);
});

// 2026-08-28 新增：year/season 不給時自動抓最新一季，跟指定最新季度結果應該一致。
test('accrualsRatio: 2330 不指定 year/season 時自動抓最新一季，結果應該跟指定最新季度一致', async () => {
  const explicit = await calculateAccrualsRatio({ companyId: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });
  const auto = await calculateAccrualsRatio({ companyId: '2330', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(auto.year, explicit.year);
  assert.equal(auto.season, explicit.season);
  assert.equal(auto.accrualsRatioQuarterly, explicit.accrualsRatioQuarterly);
});

// 完全查無資料的公司，自動抓最新一季應該優雅降級，不是丟例外。
test('accrualsRatio: 9999（查無資料的公司）自動抓最新一季應該回傳 year/season 為 null 的優雅降級結果', async () => {
  const result = await calculateAccrualsRatio({ companyId: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.year, null);
  assert.equal(result.season, null);
  assert.equal(result.accrualsRatioQuarterly, null);
  assert.ok(result.warnings.length > 0);
});

after(async () => {
  await prisma.$disconnect();
  await analysisPrisma.$disconnect();
});
