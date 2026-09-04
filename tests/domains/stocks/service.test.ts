import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { getStockQuote, getStockPrices, getExDividendNotices } from '@/domainApi/stocks/service';
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

// 2026-09-04 應 web-nuxt 要求新增——先動態查一檔真的有除權息預告的 symbol（表裡資料量小、
// 內容每天變動，不能像 2330 那樣寫死一個「長期都有資料」的代號）。
test('getExDividendNotices: 查得到的 symbol 才會出現在 notices 裡，內容跟真實資料一致', async () => {
  const sample = await twseExportPrisma.$queryRaw<{ symbol: string; ex_date: Date; ex_type: string }[]>`
    SELECT symbol, ex_date, ex_type FROM "export"."ex_dividend_notice" WHERE ex_date >= CURRENT_DATE ORDER BY ex_date ASC LIMIT 1
  `;
  if (!sample[0]) return; // 表裡目前沒有未來事件時無從驗證，跳過（資料量小、每天變動）。

  const result = await getExDividendNotices([sample[0].symbol, '__NOT_A_REAL_SYMBOL__']);
  assert.ok(sample[0].symbol in result.notices, `${sample[0].symbol} 應該查得到除權息預告`);
  assert.ok(!('__NOT_A_REAL_SYMBOL__' in result.notices), '查無資料的 symbol 不應該出現在 notices 物件裡');

  const entries = result.notices[sample[0].symbol]!;
  assert.ok(entries.some((e) => e.exDate === sample[0]!.ex_date.toISOString().slice(0, 10) && e.exType === sample[0]!.ex_type));
  for (const entry of entries) {
    assert.ok(entry.exDate >= new Date().toISOString().slice(0, 10), '只應該回傳今天以後的事件');
    assert.ok(['息', '權', '權息'].includes(entry.exType));
    // numeric 欄位鎖死要是真正的 JS number，不是 Postgres 驅動預設回傳的字串——這裡曾經
    // 漏做 Number() 轉換，型別宣告寫 number 但實際回傳字串，bff-ts 那邊照型別寫驗證邏輯
    // 會兜不起來，鎖這個測試避免回歸。
    for (const field of ['stockDividendRatio', 'subscriptionRatio', 'subscriptionPricePerShare', 'cashDividend', 'sharesOffered', 'sharesEmpOwner', 'sharesholderOwner', 'stockHoldingRatio'] as const) {
      const value = entry[field];
      if (value !== null) assert.equal(typeof value, 'number', `${field} 應該是 number，不是字串`);
    }
  }
});

test('getExDividendNotices: 空陣列應該回傳空物件，不拋錯', async () => {
  const result = await getExDividendNotices([]);
  assert.deepEqual(result.notices, {});
});

after(async () => {
  await twseExportPrisma.$disconnect();
  await tpexExportPrisma.$disconnect();
});
