import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { calculateOwnerEarnings } from '../../../src/domains/guru/ownerEarnings/service';
import prisma from '../../../src/adapters/prisma/index';
import { analysisPrisma } from '../../../src/adapters/prisma/analysisClient';

// 對照 src/domains/guru/README.md「Buffett_Owner_Earnings（股東盈餘）計算口徑」——
// 2330（台積電）115Q2 合併報表實測值。
test('ownerEarnings: 2330 115Q2 合併報表（每股版本）', async () => {
  const result = await calculateOwnerEarnings({ companyId: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.ownerEarningsPerShareQuarterly, 8.63);
  assert.equal(result.ownerEarningsPerShareQuarterlyAnnualized, 34.52);
  assert.equal(result.ownerEarningsPerShareTtm, 69.69);
  assert.equal(result.netIncome.value, '706561938');
  assert.equal(result.depreciationAndAmortization.value, '363988605');
  assert.equal(result.capitalExpenditures.value, '-846764746');
  assert.equal(result.paidInShares.value, '25932370067');
  assert.deepEqual(result.warnings, []);
});

after(async () => {
  await prisma.$disconnect();
  await analysisPrisma.$disconnect();
});
