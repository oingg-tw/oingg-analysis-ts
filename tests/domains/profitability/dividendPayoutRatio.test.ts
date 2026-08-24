import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { calculateDividendPayoutRatio } from '../../../src/domains/profitability/dividendPayoutRatio/service';
import prisma from '../../../src/adapters/prisma/index';
import { analysisPrisma } from '../../../src/adapters/prisma/analysisClient';

// 對照 src/domains/profitability/README.md「配息率／SGR 計算口徑」——2330（台積電）115Q2 合併報表實測值。
test('dividendPayoutRatio: 2330 115Q2 合併報表（只有 TTM 口徑）', async () => {
  const result = await calculateDividendPayoutRatio({ companyId: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.payoutRatioTtm, 35.34);
  assert.equal(result.dividendsPaid.value, '-285258060');
  assert.equal(result.dividendsPaidTtm.value, '-1218816294');
  assert.equal(result.netIncome.value, '706561938');
  assert.equal(result.netIncomeTtm.value, '3449225724');
  assert.deepEqual(result.warnings, []);
});

after(async () => {
  await prisma.$disconnect();
  await analysisPrisma.$disconnect();
});
