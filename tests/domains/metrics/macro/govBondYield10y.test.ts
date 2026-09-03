import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { getLatestGovBondYield10y } from '@/domainApi/metrics/macro/govBondYield10y/service';
import { govExportPrisma } from '@/adapters/prisma/govExportClient';

interface LatestGovBondYieldRow {
  year: number;
  month: number;
  yield_rate: unknown;
}

test('getLatestGovBondYield10y: 應該回傳最新一個月的殖利率，跟資料庫直接查一致', async () => {
  const [result, latestRows] = await Promise.all([
    getLatestGovBondYield10y(),
    govExportPrisma.$queryRaw<LatestGovBondYieldRow[]>`
      SELECT year, month, yield_rate FROM "export"."monthly_gov_bond_yield_10y"
      ORDER BY year DESC, month DESC LIMIT 1
    `,
  ]);
  const latestRow = latestRows[0];

  assert.ok(latestRow, '資料庫應該至少有一筆資料，這個測試才驗證得到東西');
  assert.equal(result.asOfMonth, `${latestRow!.year}-${String(latestRow!.month).padStart(2, '0')}`);
  assert.equal(result.yieldPct, Number(latestRow!.yield_rate));
  assert.deepEqual(result.warnings, []);
});

after(async () => {
  await govExportPrisma.$disconnect();
});
