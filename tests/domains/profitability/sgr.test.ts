import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { calculateSgr } from '@/domains/profitability/sgr/service';
import prisma from '@/adapters/prisma/index';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// 對照 src/domains/profitability/README.md「配息率／SGR 計算口徑」——2330（台積電）115Q2 合併報表實測值。
// 複合指標，直接引用 roe/、dividendPayoutRatio/ 的 TTM 數值，這裡順便驗證組裝邏輯本身沒錯
// （sgrTtm = roeTtm x (1 - payoutRatioTtm/100)）。
// 2026-08-27 更新：見 dividendPayoutRatio.test.ts 開頭註解，mops 現金流量表修正後 TTM 數字改變。
test('sgr: 2330 115Q2 合併報表（只有 TTM 口徑）', async () => {
  const result = await calculateSgr({ companyId: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.roeTtm.value, 34.78);
  assert.equal(result.payoutRatioTtm.value, 23.76);
  assert.equal(result.sgrTtm, 26.52);
  assert.deepEqual(result.warnings, []);
});

after(async () => {
  await prisma.$disconnect();
  await analysisPrisma.$disconnect();
});
