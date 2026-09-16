import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { getXbrlCashFlowQuarterly, getLatestQuarterWithXbrlCashFlowQuarterly } from '@/infrastructure/repositories/mops/xbrlCashFlowQuarterly';
import { mopsExportPrisma } from '@/infrastructure/prisma/mopsExportClient';

// mops-ts 2026-09-06 新增 export.xbrl_three_statements_long 的 statement_type=
// 'cash_flow_quarterly'（單季反推現金流量表，用累計數相減自己算出來的），回填後跟既有
// quarterly_cash_flow_statement（現有計算來源）交叉驗證數值一致。

test('getXbrlCashFlowQuarterly: 2330 115Q1/115Q2 的營運現金流應該跟現有計算來源 quarterly_cash_flow_statement 完全一致', async () => {
  const q1 = await getXbrlCashFlowQuarterly({ symbol: '2330', year: 115, quarter: 1, dataType: '2', subsidiaryCompanyId: '' });
  const q2 = await getXbrlCashFlowQuarterly({ symbol: '2330', year: 115, quarter: 2, dataType: '2', subsidiaryCompanyId: '' });

  assert.ok(q1, '115Q1 應該查得到資料');
  assert.ok(q2, '115Q2 應該查得到資料');

  // 跟現有 quarterly_cash_flow_statement.net_cash_from_operating_activities 的既有基準
  // 數字一致（這兩個數字已經在多次 PIT 指標交叉驗證裡確認過）。
  assert.equal(q1!.accounts.cash_flows_from_used_in_operating_activities, 698976265n);
  assert.equal(q2!.accounts.cash_flows_from_used_in_operating_activities, 783364977n);
});

test('getXbrlCashFlowQuarterly: 115Q1 加 115Q2 的單季數加總應該等於既有累計表（cumulative_cash_flow_statement_xbrl）的 115Q2 累計數', async () => {
  const q1 = await getXbrlCashFlowQuarterly({ symbol: '2330', year: 115, quarter: 1, dataType: '2', subsidiaryCompanyId: '' });
  const q2 = await getXbrlCashFlowQuarterly({ symbol: '2330', year: 115, quarter: 2, dataType: '2', subsidiaryCompanyId: '' });
  assert.ok(q1 && q2);

  const sum = q1!.accounts.cash_flows_from_used_in_operating_activities! + q2!.accounts.cash_flows_from_used_in_operating_activities!;

  const cumulativeRows = await mopsExportPrisma.$queryRawUnsafe<{ value: string }[]>(
    `SELECT value FROM "export"."xbrl_three_statements_long" WHERE symbol='2330' AND year=115 AND quarter=2 AND statement_type='cash_flow' AND account_code='cash_flows_from_used_in_operating_activities'`
  );
  assert.ok(cumulativeRows[0], '累計版（cash_flow）115Q2 應該查得到資料');
  assert.equal(sum, BigInt(cumulativeRows[0]!.value), 'Q1單季+Q2單季 應該等於 Q2 累計數，證明單季反推邏輯正確');
});

test('getXbrlCashFlowQuarterly: 查無資料的公司/季度應該回傳 null，不拋錯', async () => {
  const result = await getXbrlCashFlowQuarterly({ symbol: '9999', year: 115, quarter: 2, dataType: '2', subsidiaryCompanyId: '' });
  assert.equal(result, null);
});

test('getLatestQuarterWithXbrlCashFlowQuarterly: 應該找得到 2330 的最新一季', async () => {
  const result = await getLatestQuarterWithXbrlCashFlowQuarterly('2330', '2', '');
  assert.ok(result);
  assert.equal(result!.year, 115);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
});
