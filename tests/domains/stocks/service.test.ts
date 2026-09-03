import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { getStockQuote, getStockPrices } from '@/domains/stocks/service';
import { twseExportPrisma } from '@/adapters/prisma/twseExportClient';
import tpexExportPrisma from '@/adapters/prisma/tpexExportClient';

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

// 上櫃公司：company_profile 有登記資料就該存在（不是 404），不管 oingg-tpex 的 daily_price
// 有沒有資料——這是「公司存在但可能查無股價」跟「公司根本不存在」該是兩種不同結果的驗證，
// 不釘死 price 一定是 null（daily_price 曾經是空表，但那是暫時的資料現況，不是永久保證，
// tpex-ts 回補之後這裡不該跟著壞掉）。
test('getStockQuote: 上櫃公司查得到公司資料時，不該被誤判成不存在（不是 404）', async () => {
  const tpexCompanies = await tpexExportPrisma.$queryRaw<{ symbol: string }[]>`SELECT symbol FROM "export"."company_profile" LIMIT 1`;
  const tpexCompany = tpexCompanies[0];
  if (!tpexCompany) return; // TPEx company_profile 目前沒資料時無從驗證，跳過。

  const result = await getStockQuote(tpexCompany.symbol);
  assert.ok(result !== null, '上櫃公司應該存在，不該回 404');
  if (result!.price) {
    assert.match(result!.price.tradeDate, /^\d{4}-\d{2}-\d{2}$/);
  }
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
  await twseExportPrisma.$disconnect();
  await tpexExportPrisma.$disconnect();
});
