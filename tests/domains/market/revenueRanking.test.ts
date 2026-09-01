import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { calculateRevenueRanking } from '@/domains/market/revenueRanking/service';
import twsePrisma from '@/adapters/prisma/twseClient';
import { getTwseCompanySymbolSet, getTpexCompanySymbolSet } from '@/shared/sourceData/companyProfile';

test('calculateRevenueRanking: yoy desc 應該由高到低排序，且只留上市或上櫃公司', async () => {
  const [result, twseSymbols, tpexSymbols] = await Promise.all([
    calculateRevenueRanking({ metric: 'yoy', order: 'desc', limit: 20 }),
    getTwseCompanySymbolSet(),
    getTpexCompanySymbolSet(),
  ]);
  assert.ok(result.yearMonth !== '', '應該找得到最新一個有資料的月份');

  for (let i = 1; i < result.rankings.length; i++) {
    assert.ok(result.rankings[i - 1]!.yoyChangePercent! >= result.rankings[i]!.yoyChangePercent!, '應該由高到低排序');
  }
  result.rankings.forEach((row, index) => assert.equal(row.rank, index + 1));
  for (const row of result.rankings) {
    assert.ok(twseSymbols.has(row.symbol) || tpexSymbols.has(row.symbol), `${row.symbol} 應該是上市或上櫃公司`);
    assert.ok(row.yoyChangePercent !== null, 'yoy 排行不應該出現 yoyChangePercent 是 null 的公司');
  }
});

test('calculateRevenueRanking: mom asc 應該由低到高排序', async () => {
  const result = await calculateRevenueRanking({ metric: 'mom', order: 'asc', limit: 10 });
  for (let i = 1; i < result.rankings.length; i++) {
    assert.ok(result.rankings[i - 1]!.momChangePercent! <= result.rankings[i]!.momChangePercent!, '應該由低到高排序');
  }
});

test('calculateRevenueRanking: limit 應該限制回傳筆數', async () => {
  const result = await calculateRevenueRanking({ metric: 'revenue', order: 'desc', limit: 3 });
  assert.ok(result.rankings.length <= 3);
});

after(async () => {
  await twsePrisma.$disconnect();
});
