import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { getTaiexDailyPrice } from '@/application/market/taiexDailyPrice/service';
import { appDeps } from '@/bootstrap/deps';
import { twseExportPrisma } from '@/infrastructure/prisma/twseExportClient';

test('getTaiexDailyPrice: 應該回傳依交易日由舊到新排序的序列，且限制筆數', async () => {
  const result = await getTaiexDailyPrice(10, 'daily', appDeps);
  assert.ok(result.entries.length > 0, '應該至少有資料');
  assert.ok(result.entries.length <= 10, '不應超過 limit');

  for (let i = 1; i < result.entries.length; i++) {
    assert.ok(result.entries[i - 1]!.tradeDate < result.entries[i]!.tradeDate, 'tradeDate 應該遞增（舊到新）');
  }
  for (const entry of result.entries) {
    if (entry.close === null) continue;
    assert.ok(entry.close > 0, '大盤指數收盤價應該大於 0');
  }
});

// interval=monthly：每個日曆月只有一筆、是該月最後一個交易日（跟 daily 的最新一筆同一天）、全歷史回到 1999。
test('getTaiexDailyPrice monthly: 每月一筆取月底交易日，2000 筆上限內涵蓋 1999 年起全歷史', async () => {
  const [monthly, daily] = await Promise.all([getTaiexDailyPrice(2000, 'monthly', appDeps), getTaiexDailyPrice(1, 'daily', appDeps)]);
  const months = monthly.entries.map((e) => e.tradeDate.slice(0, 7));
  assert.equal(new Set(months).size, months.length, '每個月只能有一筆');
  assert.ok(monthly.entries.length < 2000, '全歷史月頻應該遠低於上限');
  assert.ok(monthly.entries[0]!.tradeDate < '2000-01-01', '應該回到 1999 年');
  assert.equal(monthly.entries.at(-1)!.tradeDate, daily.entries[0]!.tradeDate, '最新一筆應該是最近的交易日');
});

afterAll(async () => {
  await twseExportPrisma.$disconnect();
});
