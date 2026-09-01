import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { getStockQuote, getStockPrices } from '@/domains/stocks/service';
import twsePrisma from '@/adapters/prisma/twseClient';
import tpexPrisma from '@/adapters/prisma/tpexClient';

// 2330（台積電）長期都有股價/估值資料，跟本服務其他測試（capitalStock 等）同一個慣例選這檔。
test('getStockQuote: 已知的上市公司（2330）應該同時有 price 跟 valuation', async () => {
  const result = await getStockQuote('2330');
  assert.ok(result !== null, '2330 應該存在');
  assert.equal(result!.symbol, '2330');
  assert.ok(result!.price !== null, '2330 應該查得到股價');
  assert.ok(result!.valuation !== null, '2330 應該查得到估值');
});

// 查無公司代號（上市、上櫃都沒有登記資料）應該回傳 null，讓 controller 轉成 404。
test('getStockQuote: 查無此代號的公司應該回傳 null', async () => {
  const result = await getStockQuote('0000');
  assert.equal(result, null);
});

// 上櫃公司：company_profile 有登記資料，但 oingg-tpex 的 daily_price 目前是空表（2026-09-01
// 現況，見 src/shared/sourceData/twseMarketData.ts 的說明），所以 price 一定是 null——這剛好
// 驗證到「公司存在但查無股價」跟「公司根本不存在」是兩種不同結果，不是同一種 null。
test('getStockQuote: 上櫃公司查得到公司資料時，price 是 null 不代表公司不存在', async () => {
  const tpexCompany = await tpexPrisma.companyProfile.findFirst({ select: { symbol: true } });
  if (!tpexCompany) return; // TPEx company_profile 目前沒資料時無從驗證，跳過。

  const result = await getStockQuote(tpexCompany.symbol);
  assert.ok(result !== null, '上櫃公司應該存在，不該回 404');
  assert.equal(result!.price, null, 'oingg-tpex daily_price 目前是空表，price 應該是 null');
});

test('getStockPrices: 查得到的 symbol 才會出現在 prices 裡，查不到的直接不出現（不是回傳 null 值）', async () => {
  const result = await getStockPrices(['2330', '0000']);
  assert.ok('2330' in result.prices, '2330 應該查得到股價');
  assert.ok(!('0000' in result.prices), '查無資料的 symbol 不應該出現在 prices 物件裡');
});

test('getStockPrices: 空陣列應該回傳空物件，不拋錯', async () => {
  const result = await getStockPrices([]);
  assert.deepEqual(result.prices, {});
});

after(async () => {
  await twsePrisma.$disconnect();
  await tpexPrisma.$disconnect();
});
