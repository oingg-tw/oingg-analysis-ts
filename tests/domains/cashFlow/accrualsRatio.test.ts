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

after(async () => {
  await prisma.$disconnect();
  await analysisPrisma.$disconnect();
});
