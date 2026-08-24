import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { calculateSgr } from '../../../src/domains/profitability/sgr/service';
import prisma from '../../../src/adapters/prisma/index';
import { analysisPrisma } from '../../../src/adapters/prisma/analysisClient';

// 對照 src/domains/profitability/README.md「配息率／SGR 計算口徑」——2330（台積電）115Q2 合併報表實測值。
// 複合指標，直接引用 roe/、dividendPayoutRatio/ 的 TTM 數值，這裡順便驗證組裝邏輯本身沒錯
// （sgrTtm = roeTtm x (1 - payoutRatioTtm/100)）。
test('sgr: 2330 115Q2 合併報表（只有 TTM 口徑）', async () => {
  const result = await calculateSgr({ companyId: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.roeTtm.value, 53.62);
  assert.equal(result.payoutRatioTtm.value, 35.34);
  assert.equal(result.sgrTtm, 34.67);
  assert.deepEqual(result.warnings, []);
});

after(async () => {
  await prisma.$disconnect();
  await analysisPrisma.$disconnect();
});
