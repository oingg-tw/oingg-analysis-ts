import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { getCashFlowStatementXbrlFirst } from '@/shared/sourceData/cashFlowStatementXbrlFirst';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';

// XBRL（xbrl_three_statements_long 的 cash_flow_quarterly）優先、查無資料退回既有
// quarterly_cash_flow_statement 的 coalesce 查詢層——2026-09-07 規劃這批換源時逐欄位
// 用 2330 115Q2 交叉驗證過，這裡驗證 coalesce 邏輯本身（XBRL 分支/fallback 分支/都查
// 無資料）。

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

test('getCashFlowStatementXbrlFirst: 1476 112Q2（XBRL 完全查無這一季，只有舊表有）應該 fallback 到既有三大表', async () => {
  // 2026-09-07 規劃時直接查證過：這個 symbol/年季在 xbrl_three_statements_long 的
  // cash_flow_quarterly 完全沒有列，但 quarterly_cash_flow_statement 有真實資料。
  const xbrlRows = await mopsExportPrisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*)::bigint as count FROM "export"."xbrl_three_statements_long" WHERE symbol='1476' AND year=112 AND quarter=2 AND statement_type='cash_flow_quarterly'`
  );
  assert.equal(xbrlRows[0]!.count, 0n, '前提假設：這個案例 XBRL 應該完全沒有資料，測試才有意義');

  const result = await getCashFlowStatementXbrlFirst({ symbol: '1476', year: 112, quarter: 2, dataType: '2', subsidiaryCompanyId: '' });
  assert.ok(result, '應該 fallback 到舊表查到資料，不是回傳 null');
  assert.equal(result!.netCashFromOperatingActivities, -527253n);
  assert.equal(result!.capitalExpenditures, -62484n);
});

test('getCashFlowStatementXbrlFirst: 查無任何資料（新舊都沒有）應該回傳 null，不拋錯', async () => {
  const result = await getCashFlowStatementXbrlFirst({ symbol: '999999', year: 115, quarter: 2, dataType: '2', subsidiaryCompanyId: '' });
  assert.equal(result, null);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
});
