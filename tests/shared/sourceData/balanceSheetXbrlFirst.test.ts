import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { getBalanceSheetXbrlFirst } from '@/shared/sourceData/balanceSheetXbrlFirst';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';

// XBRL（quarterly_balance_sheet_xbrl 寬表）優先、查無資料退回既有 quarterly_balance_sheet
// 的 coalesce 查詢層——2026-09-07 規劃這批換源時逐欄位用 2330/2317/1301/2412/2887/1101/
// 1312/1522/2002 115Q1/115Q2 交叉驗證過，這裡驗證 coalesce 邏輯本身（XBRL 分支/fallback
// 分支/都查無資料）。

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

test('getBalanceSheetXbrlFirst: 1435 115Q2（XBRL 完全查無這一季，只有舊表有）應該 fallback 到既有三大表', async () => {
  const xbrlRows = await mopsExportPrisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*)::bigint as count FROM "export"."quarterly_balance_sheet_xbrl" WHERE symbol='1435' AND year=115 AND quarter=2`
  );
  assert.equal(xbrlRows[0]!.count, 0n, '前提假設：這個案例 XBRL 應該完全沒有資料，測試才有意義');

  const result = await getBalanceSheetXbrlFirst({ symbol: '1435', year: 115, quarter: 2, dataType: '2', subsidiaryCompanyId: '' });
  assert.ok(result, '應該 fallback 到舊表查到資料，不是回傳 null');
  assert.equal(result!.totalAssets, 1103241n);
  assert.equal(result!.totalLiabilities, 185513n);
  assert.equal(result!.currentAssets, 303341n);
  assert.equal(result!.currentLiabilities, 7709n);
  assert.equal(result!.inventory, 4560n);
  assert.equal(result!.longTermBorrowings, null);
  assert.equal(result!.propertyPlantEquipment, 43592n);
  assert.equal(result!.retainedEarnings, -301289n);
  assert.equal(result!.cashAndEquivalents, 16502n);
  assert.equal(result!.equityAttributableToParent, null);
  assert.equal(result!.totalEquity, 917728n);
  assert.equal(result!.accountsPayable, 0n);
  assert.equal(result!.accountsReceivable, 0n);
  assert.equal(result!.bondsPayable, null);
  assert.equal(result!.shortTermBorrowings, null);
  assert.equal(result!.preferredStockCapital, null);
});

test('getBalanceSheetXbrlFirst: 查無任何資料（新舊都沒有）應該回傳 null，不拋錯', async () => {
  const result = await getBalanceSheetXbrlFirst({ symbol: '999999', year: 115, quarter: 2, dataType: '2', subsidiaryCompanyId: '' });
  assert.equal(result, null);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
});
