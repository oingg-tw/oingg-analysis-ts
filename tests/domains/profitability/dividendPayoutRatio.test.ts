import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { calculateDividendPayoutRatio } from '@/domains/profitability/dividendPayoutRatio/service';
import prisma from '@/adapters/prisma/index';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// 對照 src/domains/profitability/README.md「配息率／SGR 計算口徑」——2330（台積電）115Q2 合併報表實測值。
// 2026-08-27 更新：mops 修正 quarterly_cash_flow_statement 為真的單季數（原本全部季度都是
// 當年累計數，不是只有 Q4），本季（單季）跟 TTM 的股利發放/淨利數字都改變了。
test('dividendPayoutRatio: 2330 115Q2 合併報表（只有 TTM 口徑）', async () => {
  const result = await calculateDividendPayoutRatio({ companyId: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.payoutRatioTtm, 23.76);
  assert.equal(result.dividendsPaid.value, '-155595147');
  assert.equal(result.dividendsPaidTtm.value, '-531618438');
  assert.equal(result.netIncome.value, '706561938');
  assert.equal(result.netIncomeTtm.value, '2237087087');
  assert.deepEqual(result.warnings, []);
});

after(async () => {
  await prisma.$disconnect();
  await analysisPrisma.$disconnect();
});
