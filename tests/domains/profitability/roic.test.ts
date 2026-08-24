import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { calculateRoic } from '../../../src/domains/profitability/roic/service';
import prisma from '../../../src/adapters/prisma/index';
import { analysisPrisma } from '../../../src/adapters/prisma/analysisClient';

// 對照 src/domains/profitability/README.md「ROIC/ROCE 計算口徑」——2330（台積電）115Q2 合併報表實測值。
test('roic: 2330 115Q2 合併報表', async () => {
  const result = await calculateRoic({ companyId: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.roicQuarterlyPct, 17.04);
  assert.equal(result.roicQuarterlyAnnualizedPct, 68.16);
  assert.equal(result.roicTtmPct, 83.23);
  assert.equal(result.nopat.value, '709309190');
  assert.equal(result.nopatTtm.value, '3464462813');
  assert.equal(result.investedCapital.value, '4162563795');
  assert.deepEqual(result.warnings, []);
});

after(async () => {
  await prisma.$disconnect();
  await analysisPrisma.$disconnect();
});
