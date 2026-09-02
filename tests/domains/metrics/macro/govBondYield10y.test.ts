import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { getLatestGovBondYield10y } from '@/domains/metrics/macro/govBondYield10y/service';
import govPrisma from '@/adapters/prisma/govClient';

test('getLatestGovBondYield10y: 應該回傳最新一個月的殖利率，跟資料庫直接查一致', async () => {
  const [result, latestRow] = await Promise.all([
    getLatestGovBondYield10y(),
    govPrisma.monthlyGovBondYield10y.findFirst({ orderBy: [{ year: 'desc' }, { month: 'desc' }] }),
  ]);

  assert.ok(latestRow, '資料庫應該至少有一筆資料，這個測試才驗證得到東西');
  assert.equal(result.asOfMonth, `${latestRow!.year}-${String(latestRow!.month).padStart(2, '0')}`);
  assert.equal(result.yieldPct, Number(latestRow!.yieldRate));
  assert.deepEqual(result.warnings, []);
});

after(async () => {
  await govPrisma.$disconnect();
});
