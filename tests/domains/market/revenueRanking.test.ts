import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { calculateRevenueRanking } from '@/api/bff/market/revenueRanking/service';
import { twseExportPrisma } from '@/infrastructure/prisma/twseExportClient';
import { getSecuritySymbolSet } from '@/models/companyProfile';

test('calculateRevenueRanking: yoy desc 應該由高到低排序，且只留上市或上櫃公司', async () => {
  const [result, twseSymbols, tpexSymbols] = await Promise.all([
    calculateRevenueRanking({ metric: 'yoy', order: 'desc', limit: 20 }),
    getSecuritySymbolSet({ market: 'TWSE', preferredStock: 'exclude' }),
    getSecuritySymbolSet({ market: 'TPEx', preferredStock: 'exclude' }),
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

test('calculateRevenueRanking: limit 應該限制回傳筆數', async () => {
  const result = await calculateRevenueRanking({ metric: 'yoy', order: 'desc', limit: 3 });
  assert.ok(result.rankings.length <= 3);
});

// 2026-09-02 應使用者要求：yoy 排行排除超過 300% 的公司——基期趨近於零造成的統計失真
// （例如建案交屋、生技授權金等認列時點集中的產業），不是真實的營運成長。這個問題只發生在
// 正的那一側（分母趨近零時比值趨近正無限大，分子趨近零時比值只會趨近 -100%，本身有界），
// 所以只驗證上界，不驗證下界。
test('calculateRevenueRanking: yoy 排行不應該出現超過 300% 的公司（基期趨近於零的統計失真）', async () => {
  const result = await calculateRevenueRanking({ metric: 'yoy', order: 'desc', limit: 50 });
  assert.ok(result.rankings.length > 0);
  for (const row of result.rankings) {
    assert.ok(row.yoyChangePercent! <= 300, `${row.symbol} 的 yoyChangePercent (${row.yoyChangePercent}) 應該已經被排除`);
  }
});

afterAll(async () => {
  await twseExportPrisma.$disconnect();
});
