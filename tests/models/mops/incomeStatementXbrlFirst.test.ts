import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { getIncomeStatementXbrlFirst } from '@/models/mops/incomeStatementXbrlFirst';
import { mopsExportPrisma } from '@/infrastructure/prisma/mopsExportClient';

// 2026-09-07 規劃這批換源時逐欄位用 2330 115Q2 交叉驗證過。2026-09-11 舊三大表
// （quarterly_income_statement）已退役，這支現在單純查 XBRL 寬表，不再有 fallback 分支。

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

test('getIncomeStatementXbrlFirst: 查無 XBRL 資料應該回傳 null，不拋錯（舊表已退役，不再 fallback）', async () => {
  const result = await getIncomeStatementXbrlFirst({ symbol: '999999', year: 115, quarter: 2, dataType: '2', subsidiaryCompanyId: '' });
  assert.equal(result, null);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
});
