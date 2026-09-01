import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { listAttentionStocks } from '@/domains/market/attentionStocks/service';
import twsePrisma from '@/adapters/prisma/twseClient';

test('listAttentionStocks: 應該依交易日由新到舊排序，且不超過 limit 筆', async () => {
  const result = await listAttentionStocks({ limit: 20 });
  for (let i = 1; i < result.items.length; i++) {
    assert.ok(result.items[i - 1]!.tradeDate >= result.items[i]!.tradeDate, '應該由新到舊排序');
  }
  assert.ok(result.items.length <= 20);
});

test('listAttentionStocks: limit 應該限制回傳筆數', async () => {
  const result = await listAttentionStocks({ limit: 1 });
  assert.ok(result.items.length <= 1);
});

after(async () => {
  await twsePrisma.$disconnect();
});
