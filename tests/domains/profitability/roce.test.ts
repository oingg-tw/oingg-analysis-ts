import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { calculateRoce } from '@/domains/profitability/roce/service';
import prisma from '@/adapters/prisma/index';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// 對照 src/domains/profitability/README.md「ROIC/ROCE 計算口徑」——2330（台積電）115Q2 合併報表實測值。
// 2026-08-27 更新：見 turnoverRatio.test.ts 開頭註解，mops Q4 資料修正後 TTM 系列數字改變。
test('roce: 2330 115Q2 合併報表', async () => {
  const result = await calculateRoce({ companyId: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.roceQuarterlyPct, 11.51);
  assert.equal(result.roceQuarterlyAnnualizedPct, 46.04);
  assert.equal(result.roceTtmPct, 35.65);
  assert.equal(result.ebit.value, '865515135');
  assert.equal(result.ebitTtm.value, '2679765926');
  assert.equal(result.capitalEmployed.value, '7517892902');
  assert.deepEqual(result.warnings, []);
});

after(async () => {
  await prisma.$disconnect();
  await analysisPrisma.$disconnect();
});
