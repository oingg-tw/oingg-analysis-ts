import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { listDisposedStocks } from '@/domainApi/market/disposedStocks/service';
import { twseExportPrisma } from '@/adapters/prisma/twseExportClient';
import { getSecuritySymbolSet } from '@/shared/sourceData/companyProfile';

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

test('listDisposedStocks: 清單裡不應該出現非上市/上櫃公司', async () => {
  const [result, twseSymbols, tpexSymbols] = await Promise.all([
    listDisposedStocks({ limit: 50 }),
    getSecuritySymbolSet({ market: 'TWSE', preferredStock: 'exclude' }),
    getSecuritySymbolSet({ market: 'TPEx', preferredStock: 'exclude' }),
  ]);
  for (const row of result.items) {
    const companySymbols = row.market === 'TWSE' ? twseSymbols : tpexSymbols;
    assert.ok(companySymbols.has(row.symbol), `${row.symbol}（${row.market}）不在 company_profile 裡，應該已經被排除`);
  }
});

afterAll(async () => {
  await twseExportPrisma.$disconnect();
});
