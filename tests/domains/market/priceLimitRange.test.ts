import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { getPriceLimitRange } from '@/domainApi/market/priceLimitRange/service';
import { twseExportPrisma } from '@/adapters/prisma/twseExportClient';

test('getPriceLimitRange: widest/narrowest 都應該依 rank 遞增，且不超過 20 筆', async () => {
  const result = await getPriceLimitRange();
  assert.ok(result.tradeDate !== '', '應該找得到最新一個交易日');
  assert.ok(result.widest.length <= 20);
  assert.ok(result.narrowest.length <= 20);

  for (const group of [result.widest, result.narrowest]) {
    for (let i = 1; i < group.length; i++) {
      assert.ok(group[i - 1]!.rank < group[i]!.rank, 'rank 應該遞增');
    }
  }

  for (const row of result.widest) {
    assert.ok(row.limitRange !== null, 'widest/narrowest 的 limitRange 應該有值');
  }
});

afterAll(async () => {
  await twseExportPrisma.$disconnect();
});
