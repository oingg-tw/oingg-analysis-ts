import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { calculateRoce } from '../../../src/domains/profitability/roce/service';
import prisma from '../../../src/adapters/prisma/index';
import { analysisPrisma } from '../../../src/adapters/prisma/analysisClient';

// 對照 src/domains/profitability/README.md「ROIC/ROCE 計算口徑」——2330（台積電）115Q2 合併報表實測值。
test('roce: 2330 115Q2 合併報表', async () => {
  const result = await calculateRoce({ companyId: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.roceQuarterlyPct, 11.51);
  assert.equal(result.roceQuarterlyAnnualizedPct, 46.04);
  assert.equal(result.roceTtmPct, 55.05);
  assert.equal(result.ebit.value, '865515135');
  assert.equal(result.ebitTtm.value, '4138392502');
  assert.equal(result.capitalEmployed.value, '7517892902');
  assert.deepEqual(result.warnings, []);
});

after(async () => {
  await prisma.$disconnect();
  await analysisPrisma.$disconnect();
});
