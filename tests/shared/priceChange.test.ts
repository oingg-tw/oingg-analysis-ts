import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { getCumulativeChangePercent, cumulativeChangePercentKey } from '@/shared/sourceData/priceChange';
import twsePrisma from '@/adapters/prisma/twseClient';

test('getCumulativeChangePercent: TWSE 2330 應該等於最新收盤跟往前6個交易日收盤的點對點漲跌幅', async () => {
  const dates = await twsePrisma.dailyPrice.findMany({
    distinct: ['tradeDate'],
    where: { symbol: '2330' },
    orderBy: { tradeDate: 'desc' },
    take: 7,
    select: { tradeDate: true },
  });
  if (dates.length < 7) return; // 資料不足7個交易日，這個案例驗證不到，跳過。

  const asOfDate = dates[0]!.tradeDate;
  const baseDate = dates[6]!.tradeDate;
  const [latestRow, baseRow] = await Promise.all([
    twsePrisma.dailyPrice.findUnique({ where: { symbol_tradeDate: { symbol: '2330', tradeDate: asOfDate } }, select: { close: true } }),
    twsePrisma.dailyPrice.findUnique({ where: { symbol_tradeDate: { symbol: '2330', tradeDate: baseDate } }, select: { close: true } }),
  ]);
  if (latestRow?.close == null || baseRow?.close == null) return; // 收盤價缺值，跳過。

  const expected = Math.round(((Number(latestRow.close) - Number(baseRow.close)) / Number(baseRow.close)) * 100 * 100) / 100;

  const result = await getCumulativeChangePercent([{ symbol: '2330', market: 'TWSE', asOfDate }], 6);
  assert.equal(result.get(cumulativeChangePercentKey('TWSE', '2330', asOfDate)), expected);
});

test('getCumulativeChangePercent: 資料不足6個交易日時回傳 null，不拋錯', async () => {
  const result = await getCumulativeChangePercent([{ symbol: '2330', market: 'TWSE', asOfDate: new Date('1990-01-01') }], 6);
  assert.equal(result.get(cumulativeChangePercentKey('TWSE', '2330', new Date('1990-01-01'))), null);
});

test('getCumulativeChangePercent: 查無資料的 symbol 也回傳 null，不影響其他 symbol', async () => {
  const dates = await twsePrisma.dailyPrice.findMany({ distinct: ['tradeDate'], orderBy: { tradeDate: 'desc' }, take: 1, select: { tradeDate: true } });
  if (dates.length === 0) return;
  const asOfDate = dates[0]!.tradeDate;

  const result = await getCumulativeChangePercent([{ symbol: '__NOT_A_REAL_SYMBOL__', market: 'TWSE', asOfDate }], 6);
  assert.equal(result.get(cumulativeChangePercentKey('TWSE', '__NOT_A_REAL_SYMBOL__', asOfDate)), null);
});

after(async () => {
  await twsePrisma.$disconnect();
});
