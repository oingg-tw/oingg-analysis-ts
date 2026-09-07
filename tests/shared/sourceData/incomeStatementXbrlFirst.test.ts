import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { getIncomeStatementXbrlFirst } from '@/shared/sourceData/incomeStatementXbrlFirst';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';

// XBRL（quarterly_income_statement_xbrl 寬表）優先、查無資料退回既有
// quarterly_income_statement 的 coalesce 查詢層——2026-09-07 規劃這批換源時逐欄位用
// 2330 115Q2 交叉驗證過，這裡驗證 coalesce 邏輯本身（XBRL 分支/fallback 分支/都查無資料）。

test('getIncomeStatementXbrlFirst: 2330 115Q2（XBRL 有資料）欄位應該跟 XBRL 完全一致', async () => {
  const result = await getIncomeStatementXbrlFirst({ symbol: '2330', year: 115, quarter: 2, dataType: '2', subsidiaryCompanyId: '' });
  assert.ok(result);
  assert.equal(result!.operatingRevenue, 1270380250n);
  assert.equal(result!.grossProfit, 860310695n);
  assert.equal(result!.operatingIncome, 766602651n, '對應 profit_loss_from_operating_activities，不是 gross_profit_loss_from_operations（那個其實等於 grossProfit）');
  assert.equal(result!.profitBeforeTax, 862430086n);
  assert.equal(result!.netIncome, 706780923n);
  assert.equal(result!.adminExpenses, 21366992n);
  assert.equal(result!.financeCosts, 3085049n);
  assert.equal(result!.incomeTaxExpense, 155649163n);
  assert.equal(result!.netIncomeAttributableToParent, 706561938n);
  assert.equal(result!.operatingCost, 410069555n);
  assert.equal(result!.sellingExpenses, 4468953n);
});

test('getIncomeStatementXbrlFirst: 1435 115Q2（XBRL 完全查無這一季，只有舊表有）應該 fallback 到既有三大表', async () => {
  const xbrlRows = await mopsExportPrisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*)::bigint as count FROM "export"."quarterly_income_statement_xbrl" WHERE symbol='1435' AND year=115 AND quarter=2`
  );
  assert.equal(xbrlRows[0]!.count, 0n, '前提假設：這個案例 XBRL 應該完全沒有資料，測試才有意義');

  const result = await getIncomeStatementXbrlFirst({ symbol: '1435', year: 115, quarter: 2, dataType: '2', subsidiaryCompanyId: '' });
  assert.ok(result, '應該 fallback 到舊表查到資料，不是回傳 null');
  assert.equal(result!.operatingRevenue, 1496n);
  assert.equal(result!.grossProfit, 960n);
  assert.equal(result!.operatingIncome, -63183n);
  assert.equal(result!.profitBeforeTax, -63335n);
  assert.equal(result!.netIncome, -63335n);
  assert.equal(result!.adminExpenses, 64143n);
  assert.equal(result!.financeCosts, 4n);
  assert.equal(result!.incomeTaxExpense, 0n);
  assert.equal(result!.netIncomeAttributableToParent, null);
  assert.equal(result!.operatingCost, 536n);
  assert.equal(result!.sellingExpenses, null);
});

test('getIncomeStatementXbrlFirst: 查無任何資料（新舊都沒有）應該回傳 null，不拋錯', async () => {
  const result = await getIncomeStatementXbrlFirst({ symbol: '999999', year: 115, quarter: 2, dataType: '2', subsidiaryCompanyId: '' });
  assert.equal(result, null);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
});
