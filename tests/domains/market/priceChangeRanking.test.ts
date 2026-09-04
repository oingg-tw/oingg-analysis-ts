import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { calculatePriceChangeRanking } from '@/api/bff/market/priceChangeRanking/service';
import { twseExportPrisma } from '@/adapters/prisma/twseExportClient';
import { getSecuritySymbolSet } from '@/shared/sourceData/companyProfile';

test('calculatePriceChangeRanking: gainers 由大到小、losers 由小到大排序，且不超過 limit 筆', async () => {
  const result = await calculatePriceChangeRanking({ limit: 20 });

  for (let i = 1; i < result.gainers.length; i++) {
    assert.ok(result.gainers[i - 1]!.changePercent >= result.gainers[i]!.changePercent, 'gainers 應該由大到小排序');
  }
  for (let i = 1; i < result.losers.length; i++) {
    assert.ok(result.losers[i - 1]!.changePercent <= result.losers[i]!.changePercent, 'losers 應該由小到大排序（跌最多排最前面）');
  }
  assert.ok(result.gainers.length <= 20);
  assert.ok(result.losers.length <= 20);

  for (const row of [...result.gainers, ...result.losers]) {
    const expected = Math.round(((row.close - row.previousClose) / row.previousClose) * 100 * 100) / 100;
    assert.equal(row.changePercent, expected, 'changePercent 應該等於 (close-previousClose)/previousClose*100');
    assert.ok(row.previousClose > 0, '分母不應該是 0 或負值');
  }
});

test('calculatePriceChangeRanking: 排行裡不應該出現 ETF/衍生性商品', async () => {
  const [result, twseSymbols, tpexSymbols] = await Promise.all([
    calculatePriceChangeRanking({ limit: 50 }),
    getSecuritySymbolSet({ market: 'TWSE', preferredStock: 'exclude' }),
    getSecuritySymbolSet({ market: 'TPEx', preferredStock: 'exclude' }),
  ]);
  for (const row of [...result.gainers, ...result.losers]) {
    const companySymbols = row.market === 'TWSE' ? twseSymbols : tpexSymbols;
    assert.ok(companySymbols.has(row.symbol), `${row.symbol}（${row.market}）不在 company_profile 裡，應該已經被排除`);
  }
});

test('calculatePriceChangeRanking: limit 應該限制回傳筆數', async () => {
  const result = await calculatePriceChangeRanking({ limit: 3 });
  assert.ok(result.gainers.length <= 3);
  assert.ok(result.losers.length <= 3);
});

afterAll(async () => {
  await twseExportPrisma.$disconnect();
});
