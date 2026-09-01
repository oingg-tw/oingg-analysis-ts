import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { calculateEtfRanking } from '@/domains/market/etfRanking/service';
import sitcaExportPrisma from '@/adapters/prisma/sitcaExportClient';

test('calculateEtfRanking: aum desc 應該由大到小排序', async () => {
  const result = await calculateEtfRanking({ metric: 'aum', order: 'desc', limit: 10 });
  assert.ok(result.rankings.length > 0, '應該至少排得出幾筆');
  for (let i = 1; i < result.rankings.length; i++) {
    assert.ok(result.rankings[i - 1]!.value >= result.rankings[i]!.value, '應該由大到小排序');
  }
  result.rankings.forEach((row, index) => assert.equal(row.rank, index + 1));
});

test('calculateEtfRanking: netFlow 應該等於申購金額減贖回金額', async () => {
  const result = await calculateEtfRanking({ metric: 'netFlow', order: 'desc', limit: 5 });
  assert.ok(result.rankings.length > 0);

  const rows = await sitcaExportPrisma.$queryRawUnsafe<{ security_code: string; subscription_amount_twd: bigint; redemption_amount_twd: bigint }[]>(
    `SELECT security_code, subscription_amount_twd, redemption_amount_twd FROM "export"."etf_monthly_statement" WHERE security_code = ANY($1)`,
    result.rankings.map((r) => r.symbol)
  );
  const bySymbol = new Map(rows.map((r) => [r.security_code, r]));
  for (const row of result.rankings) {
    const raw = bySymbol.get(row.symbol)!;
    assert.equal(row.value, Number(raw.subscription_amount_twd) - Number(raw.redemption_amount_twd));
  }
});

test('calculateEtfRanking: return1y asc 應該由小到大排序', async () => {
  const result = await calculateEtfRanking({ metric: 'return1y', order: 'asc', limit: 5 });
  for (let i = 1; i < result.rankings.length; i++) {
    assert.ok(result.rankings[i - 1]!.value <= result.rankings[i]!.value, '應該由小到大排序');
  }
});

test('calculateEtfRanking: expenseRatio 只採用最新一個完整年度，asOf 是去年', async () => {
  const result = await calculateEtfRanking({ metric: 'expenseRatio', order: 'asc', limit: 20 });
  const expectedYear = String(new Date().getFullYear() - 1);
  for (const row of result.rankings) {
    assert.equal(row.asOf, expectedYear, 'asOf 應該是最新一個完整年度');
  }
});

test('calculateEtfRanking: limit 應該限制回傳筆數', async () => {
  const result = await calculateEtfRanking({ metric: 'holders', order: 'desc', limit: 2 });
  assert.ok(result.rankings.length <= 2);
});

after(async () => {
  await sitcaExportPrisma.$disconnect();
});
