import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { getBalanceSheetXbrlFirst } from '@/models/mops/balanceSheetXbrlFirst';
import { mopsExportPrisma } from '@/infrastructure/prisma/mopsExportClient';

// 2026-09-07 規劃這批換源時逐欄位用 2330/2317/1301/2412/2887/1101/1312/1522/2002
// 115Q1/115Q2 交叉驗證過。2026-09-11 舊三大表（quarterly_balance_sheet）已退役，
// 這支現在單純查 XBRL 寬表，不再有 fallback 分支。

test('getBalanceSheetXbrlFirst: 2330 115Q2（XBRL 有資料）欄位應該跟 XBRL 完全一致', async () => {
  const result = await getBalanceSheetXbrlFirst({ symbol: '2330', year: 115, quarter: 2, dataType: '2', subsidiaryCompanyId: '' });
  assert.ok(result);
  assert.equal(result!.totalAssets, 9375654727n);
  assert.equal(result!.totalLiabilities, 2901183746n);
  assert.equal(result!.currentAssets, 4565700742n);
  assert.equal(result!.currentLiabilities, 1857761825n);
  assert.equal(result!.inventory, 385524542n);
  assert.equal(result!.longTermBorrowings, 49226958n);
  assert.equal(result!.propertyPlantEquipment, 4302880478n);
  assert.equal(result!.cashAndEquivalents, 3134218213n);
  assert.equal(result!.totalEquity, 6474470981n);
  assert.equal(result!.equityAttributableToParent, 6432518334n);
  assert.equal(result!.accountsReceivable, 435762477n);
  assert.equal(result!.accountsPayable, 108890080n, '只對應 trade_payables_to_trade_suppliers，不含 related party 的 1735737');
  assert.equal(result!.bondsPayable, 815036716n, '只對應 noncurrent_portion_of_bonds_issued');
});

test('getBalanceSheetXbrlFirst: 1301 115Q2（同時有流動+非流動公司債部分）bondsPayable 只取非流動部分，不加總', async () => {
  const result = await getBalanceSheetXbrlFirst({ symbol: '1301', year: 115, quarter: 2, dataType: '2', subsidiaryCompanyId: '' });
  assert.ok(result);
  assert.equal(result!.bondsPayable, 36805986n, '非流動部分 36805986，流動部分 8474161 不應該被加進來');
  assert.equal(result!.shortTermBorrowings, 44322236n);
});

test('getBalanceSheetXbrlFirst: 1101 115Q2（有特別股股本）preferredStockCapital 對應 preference_share', async () => {
  const result = await getBalanceSheetXbrlFirst({ symbol: '1101', year: 115, quarter: 2, dataType: '2', subsidiaryCompanyId: '' });
  assert.ok(result);
  assert.equal(result!.preferredStockCapital, 2000000n);
});

test('getBalanceSheetXbrlFirst: 查無 XBRL 資料應該回傳 null，不拋錯（舊表已退役，不再 fallback）', async () => {
  const result = await getBalanceSheetXbrlFirst({ symbol: '999999', year: 115, quarter: 2, dataType: '2', subsidiaryCompanyId: '' });
  assert.equal(result, null);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
});
