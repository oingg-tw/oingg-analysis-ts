import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { listDisposedStocks } from '@/domains/market/disposedStocks/service';
import twsePrisma from '@/adapters/prisma/twseClient';

test('listDisposedStocks: 應該依公告日期由新到舊排序，且不超過 limit 筆', async () => {
  const result = await listDisposedStocks({ limit: 20 });
  for (let i = 1; i < result.items.length; i++) {
    assert.ok(result.items[i - 1]!.announceDate >= result.items[i]!.announceDate, '應該由新到舊排序');
  }
  assert.ok(result.items.length <= 20);
});

test('listDisposedStocks: limit 應該限制回傳筆數', async () => {
  const result = await listDisposedStocks({ limit: 1 });
  assert.ok(result.items.length <= 1);
});

after(async () => {
  await twsePrisma.$disconnect();
});
