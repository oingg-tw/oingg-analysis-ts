import { test } from 'vitest';
import assert from 'node:assert/strict';
import { mopsAnnualReports } from '@/infrastructure/repositories/mops/annualReport';
import { mopsExportPrisma } from '@/infrastructure/prisma/mopsExportClient';

// 年報只認年報文件，不認「四個單季相加」補出來的累計第四季（UBIQUITOUS_LANGUAGE.md〈三〉）。
// 2317 114 年（2025）在 2026-09-25 是推導列（mops-ts 還沒 ingest 那份年報），2330 是文件列。
// 2317 補抓年報後這支的第一個斷言會失敗——那時改成新的推導列案例，不要刪掉這個對照。

test('年報：文件列回傳年報 EPS（2330 114 年 = 66.26）', async () => {
  const r = await mopsAnnualReports.getAnnualIncomeStatement({ symbol: '2330', rocYear: 114, dataType: '2', subsidiaryCompanyId: '' });
  assert.ok(r);
  assert.equal(r!.basicEps, 66.26);
  assert.equal(r!.reportDate.toISOString().slice(0, 10), '2025-12-31');
});

test('年報：四季相加補出來的推導列不算年報（2317 114 年 → null）', async () => {
  const r = await mopsAnnualReports.getAnnualIncomeStatement({ symbol: '2317', rocYear: 114, dataType: '2', subsidiaryCompanyId: '' });
  assert.equal(r, null);
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
