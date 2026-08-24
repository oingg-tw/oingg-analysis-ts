import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { calculateAccrualsRatio } from '../../../src/domains/cashFlow/accrualsRatio/service';
import prisma from '../../../src/adapters/prisma/index';
import { analysisPrisma } from '../../../src/adapters/prisma/analysisClient';

// 2330（台積電）115Q2 合併報表實測值。
test('accrualsRatio: 2330 115Q2 合併報表', async () => {
  const result = await calculateAccrualsRatio({ companyId: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.accrualsRatioQuarterly, 0.79);
  assert.equal(result.accrualsRatioQuarterlyAnnualized, 3.16);
  assert.equal(result.accrualsRatioTtm, 6.11);
  assert.equal(result.netIncome.value, '706561938');
  assert.equal(result.operatingCashFlow.value, '1482341242');
  assert.equal(result.investingCashFlow.value, '-849664174');
  assert.equal(result.totalAssets.value, '9375654727');
  assert.deepEqual(result.warnings, []);
});

after(async () => {
  await prisma.$disconnect();
  await analysisPrisma.$disconnect();
});
