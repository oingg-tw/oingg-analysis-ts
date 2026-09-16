import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { getCashFlowStatementXbrlFirst } from '@/models/mops/cashFlowStatementXbrlFirst';
import { mopsExportPrisma } from '@/infrastructure/prisma/mopsExportClient';

// 2026-09-07 規劃這批換源時逐欄位用 2330 115Q2 交叉驗證過。2026-09-11 舊三大表
// （quarterly_cash_flow_statement）已退役，這支現在單純查 XBRL（xbrl_three_statements_long
// 的 cash_flow_quarterly），不再有 fallback 分支。

test('getCashFlowStatementXbrlFirst: 2330 115Q2（XBRL 有資料）5 個直接對應欄位應該跟 XBRL 完全一致，netCashFromInvestingActivities 用會計恆等式算出來也一致', async () => {
  const result = await getCashFlowStatementXbrlFirst({ symbol: '2330', year: 115, quarter: 2, dataType: '2', subsidiaryCompanyId: '' });
  assert.ok(result);
  assert.equal(result!.netCashFromOperatingActivities, 783364977n);
  assert.equal(result!.capitalExpenditures, -496001947n);
  assert.equal(result!.depreciation, 196228853n);
  assert.equal(result!.amortization, 2309315n);
  assert.equal(result!.dividendsPaid, -155595147n);
  // 會計恆等式反推：現金淨增減(98580985) - CFO(783364977) - CFF(-184653221) - 匯率影響(-7320353)
  assert.equal(result!.netCashFromInvestingActivities, -492810418n);
});

test('getCashFlowStatementXbrlFirst: 查無 XBRL 資料應該回傳 null，不拋錯（舊表已退役，不再 fallback）', async () => {
  const result = await getCashFlowStatementXbrlFirst({ symbol: '999999', year: 115, quarter: 2, dataType: '2', subsidiaryCompanyId: '' });
  assert.equal(result, null);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
});
