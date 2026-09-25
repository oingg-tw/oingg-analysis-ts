import { test } from 'vitest';
import assert from 'node:assert/strict';
import { mopsAnnualReports } from '@/infrastructure/repositories/mops/annualReport';

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
