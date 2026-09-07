import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { getBalanceSheetXbrlFull } from '@/shared/sourceData/balanceSheetXbrlFull';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';

// 2026-09-07 使用者發現 currentFinancialAssetsAtFairValueThroughProfitOrLoss
// （current_fin_assets_fvtpl）沒有出現在既有的 balanceSheetXbrlFirst.ts（服務內部計算
// 用的 16 欄位精簡版），要求「給前端會計用戶稽核用，必須把能抓的資料都呈現上去」——這支
// 是給 GET /companies/financial-statement 用的完整版，`SELECT *` 動態濾掉
// identity/metadata 欄位，回傳全部科目，不手動列舉欄位名稱。

test('getBalanceSheetXbrlFull: 2330 115Q2 回傳的欄位數應該跟 information_schema 查到的科目欄位數一致', async () => {
  const cols = await mopsExportPrisma.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns WHERE table_schema='export' AND table_name='quarterly_balance_sheet_xbrl'`
  );
  const IDENTITY_COLUMNS = new Set(['symbol', 'year', 'quarter', 'data_type', 'subsidiary_company_id', 'report_date', 'raw_context_ref', 'created_at', 'updated_at']);
  const expectedSubjectFieldCount = cols.filter((c) => !IDENTITY_COLUMNS.has(c.column_name)).length;

  const result = (await getBalanceSheetXbrlFull({ symbol: '2330', year: 115, quarter: 2, dataType: '2', subsidiaryCompanyId: '' })) as Record<string, unknown>;
  assert.ok(result);
  const { reportDate: _reportDate, ...fields } = result;
  assert.equal(Object.keys(fields).length, expectedSubjectFieldCount, '欄位數應該跟寬表扣掉 identity/metadata 後的科目欄位數完全一致，不多不少');
});

test('getBalanceSheetXbrlFull: 2330 115Q2 應該包含 current_fin_assets_fvtpl 且有值（這次問題的起點欄位）', async () => {
  const result = (await getBalanceSheetXbrlFull({ symbol: '2330', year: 115, quarter: 2, dataType: '2', subsidiaryCompanyId: '' })) as Record<string, unknown>;
  assert.ok(result);
  assert.ok('current_fin_assets_fvtpl' in result, '應該要有這個欄位');
  assert.equal(result.current_fin_assets_fvtpl, 226375n);
});

test('getBalanceSheetXbrlFull: 完全查無 XBRL 資料時應該 fallback 到舊三大表（camelCase，欄位較少但有資料）', async () => {
  const xbrlRows = await mopsExportPrisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*)::bigint as count FROM "export"."quarterly_balance_sheet_xbrl" WHERE symbol='1101' AND year=110 AND quarter=3`
  );
  assert.equal(xbrlRows[0]!.count, 0n, '前提假設：這個案例 XBRL 應該完全沒有資料，測試才有意義');

  const result = (await getBalanceSheetXbrlFull({ symbol: '1101', year: 110, quarter: 3, dataType: '2', subsidiaryCompanyId: '' })) as Record<string, unknown>;
  assert.ok(result, '應該 fallback 到舊表查到資料，不是回傳 null');
  assert.ok('currentAssets' in result, 'fallback 到舊表時 key 應該是 camelCase，不是 snake_case');
  assert.ok(!('current_assets' in result), '不應該混用兩種 key 風格');
});

test('getBalanceSheetXbrlFull: 查無任何資料（新舊都沒有）應該回傳 null，不拋錯', async () => {
  const result = await getBalanceSheetXbrlFull({ symbol: '999999', year: 115, quarter: 2, dataType: '2', subsidiaryCompanyId: '' });
  assert.equal(result, null);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
});
