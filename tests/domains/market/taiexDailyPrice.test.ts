import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { getTaiexDailyPrice } from '@/api/bff/market/taiexDailyPrice/service';
import { twseExportPrisma } from '@/infrastructure/prisma/twseExportClient';

test('getTaiexDailyPrice: 應該回傳依交易日由舊到新排序的序列，且限制筆數', async () => {
  const result = await getTaiexDailyPrice(10);
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

afterAll(async () => {
  await twseExportPrisma.$disconnect();
});
