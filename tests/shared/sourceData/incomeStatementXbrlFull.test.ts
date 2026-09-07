import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { getIncomeStatementXbrlFull } from '@/shared/sourceData/incomeStatementXbrlFull';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';

// 跟 balanceSheetXbrlFull.test.ts 同一個目的、同一種驗證方式，見那支檔案的檔頭說明。

test('getIncomeStatementXbrlFull: 2330 115Q2 回傳的欄位數應該跟 information_schema 查到的科目欄位數一致', async () => {
  const cols = await mopsExportPrisma.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns WHERE table_schema='export' AND table_name='quarterly_income_statement_xbrl'`
  );
  const IDENTITY_COLUMNS = new Set(['symbol', 'year', 'quarter', 'data_type', 'subsidiary_company_id', 'report_date', 'raw_context_ref', 'created_at', 'updated_at']);
  const expectedSubjectFieldCount = cols.filter((c) => !IDENTITY_COLUMNS.has(c.column_name)).length;

  const result = (await getIncomeStatementXbrlFull({ symbol: '2330', year: 115, quarter: 2, dataType: '2', subsidiaryCompanyId: '' })) as Record<string, unknown>;
  assert.ok(result);
  const { reportDate: _reportDate, ...fields } = result;
  assert.equal(Object.keys(fields).length, expectedSubjectFieldCount, '欄位數應該跟寬表扣掉 identity/metadata 後的科目欄位數完全一致，不多不少');
});

test('getIncomeStatementXbrlFull: 2330 115Q2 應該包含 revenue 且跟已知基準值一致', async () => {
  const result = (await getIncomeStatementXbrlFull({ symbol: '2330', year: 115, quarter: 2, dataType: '2', subsidiaryCompanyId: '' })) as Record<string, unknown>;
  assert.ok(result);
  assert.ok('revenue' in result);
  assert.equal(result.revenue, 1270380250n);
});

test('getIncomeStatementXbrlFull: 完全查無 XBRL 資料時應該 fallback 到舊三大表（camelCase）', async () => {
  const xbrlRows = await mopsExportPrisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*)::bigint as count FROM "export"."quarterly_income_statement_xbrl" WHERE symbol='1101' AND year=110 AND quarter=3`
  );
  assert.equal(xbrlRows[0]!.count, 0n, '前提假設：這個案例 XBRL 應該完全沒有資料，測試才有意義');

  const result = (await getIncomeStatementXbrlFull({ symbol: '1101', year: 110, quarter: 3, dataType: '2', subsidiaryCompanyId: '' })) as Record<string, unknown>;
  assert.ok(result, '應該 fallback 到舊表查到資料，不是回傳 null');
  assert.ok('operatingRevenue' in result, 'fallback 到舊表時 key 應該是 camelCase');
});

test('getIncomeStatementXbrlFull: 查無任何資料（新舊都沒有）應該回傳 null，不拋錯', async () => {
  const result = await getIncomeStatementXbrlFull({ symbol: '999999', year: 115, quarter: 2, dataType: '2', subsidiaryCompanyId: '' });
  assert.equal(result, null);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
});
