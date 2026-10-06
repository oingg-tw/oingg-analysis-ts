import { test } from 'vitest';
import assert from 'node:assert/strict';
import { mopsAnnualReports } from '@/infrastructure/repositories/mops/annualReport';
import { mopsExportPrisma } from '@/infrastructure/prisma/mopsExportClient';

// 年報只認年報文件，不認「四個單季相加」補出來的累計第四季（UBIQUITOUS_LANGUAGE.md〈三〉）。
// 2317 114 年（2025）在 2026-09-25 是推導列（mops-ts 還沒 ingest 那份年報），2330 是文件列。
// 2026-10-07：mops-ts 已把推導列全部換成年報文件列（累計表第四季 108～114 年 0 筆 derived_from_quarters），固定代號的對照沒有活樣本了，
// 改成動態找推導列：有就必須回 null，沒有就跳過（推導列重新出現時這個對照自動恢復）。

test('年報：文件列回傳年報 EPS（2330 114 年 = 66.26）', async () => {
  const r = await mopsAnnualReports.getAnnualIncomeStatement({ symbol: '2330', rocYear: 114, dataType: '2', subsidiaryCompanyId: '' });
  assert.ok(r);
  assert.equal(r!.basicEps, 66.26);
  assert.equal(r!.reportDate.toISOString().slice(0, 10), '2025-12-31');
});

test('年報：四季相加補出來的推導列不算年報（有推導列時 → null）', async () => {
  const derived = await mopsExportPrisma.$queryRaw<{ symbol: string; year: number }[]>`
    SELECT d.symbol, d.year FROM "export"."cumulative_income_statement_xbrl" d
    WHERE d.quarter = 4 AND d.source = 'derived_from_quarters' AND d.data_type = '2' AND d.subsidiary_company_id = ''
      AND NOT EXISTS (SELECT 1 FROM "export"."cumulative_income_statement_xbrl" x
        WHERE x.symbol = d.symbol AND x.year = d.year AND x.quarter = 4 AND x.data_type = '2' AND x.source = 'document')
    LIMIT 1`;
  if (!derived[0]) return; // 目前沒有推導列，無從驗證
  const r = await mopsAnnualReports.getAnnualIncomeStatement({ symbol: derived[0].symbol, rocYear: derived[0].year, dataType: '2', subsidiaryCompanyId: '' });
  assert.equal(r, null);
});

test('年報：2317 114 年已補成年報文件列', async () => {
  const r = await mopsAnnualReports.getAnnualIncomeStatement({ symbol: '2317', rocYear: 114, dataType: '2', subsidiaryCompanyId: '' });
  assert.ok(r);
});

test('年報：查無該年度 → null', async () => {
  const r = await mopsAnnualReports.getAnnualIncomeStatement({ symbol: '9999', rocYear: 114, dataType: '2', subsidiaryCompanyId: '' });
  assert.equal(r, null);
});

// 偵測點（mops-ts 建議）：文件列家數突然大減，要先懷疑來源標記或 ingest 出問題，不是上游沒抓——那會讓年報口徑整年
// 安靜地變成 null。2026-09-25 實測 110~113 年各 1,602~1,868 家。
test('年報：110~113 年每年的文件列至少 1,500 家（過濾失效的偵測點）', async () => {
  const rows = await mopsExportPrisma.$queryRaw<{ year: number; n: bigint }[]>`
    SELECT year, COUNT(*) AS n FROM "export"."cumulative_income_statement_xbrl"
    WHERE quarter = 4 AND subsidiary_company_id = '' AND source = 'document' AND year BETWEEN 110 AND 113
    GROUP BY year ORDER BY year`;
  assert.equal(rows.length, 4, '110~113 四個年度都要有文件列');
  for (const row of rows) assert.ok(Number(row.n) >= 1500, `${row.year} 年只有 ${row.n} 家文件列——先查 source 標記與 ingest，再查上游`);
});
