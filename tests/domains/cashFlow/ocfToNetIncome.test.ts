import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { calculateOcfToNetIncome } from '../../../src/domains/cashFlow/ocfToNetIncome/service';
import prisma from '../../../src/adapters/prisma/index';
import { analysisPrisma } from '../../../src/adapters/prisma/analysisClient';

// 2330（台積電）115Q2 合併報表實測值。
test('ocfToNetIncome: 2330 115Q2 合併報表', async () => {
  const result = await calculateOcfToNetIncome({ companyId: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.ocfToNetIncomeQuarterly, 2.1);
  assert.equal(result.ocfToNetIncomeTtm, 1.74);
  assert.equal(result.operatingCashFlow.value, '1482341242');
  assert.equal(result.netIncome.value, '706561938');
  assert.deepEqual(result.warnings, []);
});

after(async () => {
  await prisma.$disconnect();
  await analysisPrisma.$disconnect();
});
