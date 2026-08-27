import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { calculateOcfToNetIncome } from '../../../src/domains/cashFlow/ocfToNetIncome/service';
import prisma from '../../../src/adapters/prisma/index';
import { analysisPrisma } from '../../../src/adapters/prisma/analysisClient';

// 2330（台積電）115Q2 合併報表實測值。
// 2026-08-27 更新：mops 修正 quarterly_cash_flow_statement 為真的單季數（之前每季存的其實是
// 當年累計數），本季（單季）OCF 數字也變了，不是只有 TTM 受影響。
test('ocfToNetIncome: 2330 115Q2 合併報表', async () => {
  const result = await calculateOcfToNetIncome({ companyId: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.ocfToNetIncomeQuarterly, 1.11);
  assert.equal(result.ocfToNetIncomeTtm, 1.18);
  assert.equal(result.operatingCashFlow.value, '783364977');
  assert.equal(result.netIncome.value, '706561938');
  assert.deepEqual(result.warnings, []);
});

after(async () => {
  await prisma.$disconnect();
  await analysisPrisma.$disconnect();
});
