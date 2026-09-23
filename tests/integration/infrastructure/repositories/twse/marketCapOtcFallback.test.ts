import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { getMarketCapAsOf, getStockPriceAsOf } from '@/infrastructure/repositories/twse/marketCap';
import { twseExportPrisma } from '@/infrastructure/prisma/twseExportClient';
import { tpexExportPrisma } from '@/infrastructure/prisma/tpexExportClient';

// 2026-09-24 回歸測試：這兩支先前只查 twse 的 daily_price，所以**所有上櫃公司的市值都算不出來**
// （115Q2 marketCap 有 1,255 家 missing_input，實測 1,230 家是查不到股價、只有 73 家缺股本）。
// 實際上 tpex 的 daily_price 有 11,197 檔、2021-09 起——不是上游沒收，是我們沒去拿。
// 用真實的上櫃公司釘住，避免之後有人「簡化」成只查一個 client 又把上櫃打回原形。
//
// 不釘絕對數值（股價會變），只釘「查得到」與「市值 = 股價 × 股數 的量級關係」這兩個性質。

const AS_OF = new Date('2026-08-14');

test('getStockPriceAsOf: 上櫃公司查得到股價（先查上市、查無再查上櫃）', async () => {
  for (const symbol of ['6488', '5483', '8069']) {
    const price = await getStockPriceAsOf(symbol, AS_OF);
    assert.ok(price, `${symbol} 應該查得到股價——查不到代表上櫃 fallback 又被拿掉了`);
    assert.ok(price!.closePrice > 0, `${symbol} 的收盤價應該是正數`);
  }
});

test('getStockPriceAsOf: 上市公司不受影響', async () => {
  const price = await getStockPriceAsOf('2330', AS_OF);
  assert.ok(price);
  assert.ok(price!.closePrice > 0);
});

test('getMarketCapAsOf: 上櫃公司算得出市值，且等於股價 × 流通股數', async () => {
  const symbol = '6488';
  const [price, cap] = await Promise.all([getStockPriceAsOf(symbol, AS_OF), getMarketCapAsOf(symbol, AS_OF)]);

  assert.ok(cap, '上櫃公司應該算得出市值');
  assert.ok(price);
  // 市值必須跟「股價 × 股數」一致——這同時驗證了兩個資料源（tpex 股價 + mops 股本）真的被組在一起，
  // 而不是其中一邊回了預設值。
  // paidInShares 是 bigint（股數是整數、可能超過 Number.MAX_SAFE_INTEGER 的量級），要顯式轉換。
  assert.equal(cap!.marketCap, price!.closePrice * Number(cap!.paidInShares));
});

afterAll(async () => {
  await Promise.all([twseExportPrisma.$disconnect(), tpexExportPrisma.$disconnect()]);
});
