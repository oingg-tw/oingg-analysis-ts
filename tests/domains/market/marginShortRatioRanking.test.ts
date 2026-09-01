import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { calculateMarginShortRatioRanking } from '@/domains/market/marginShortRatioRanking/service';
import twsePrisma from '@/adapters/prisma/twseClient';
import { getTwseCompanySymbolSet } from '@/shared/sourceData/companyProfile';

test('calculateMarginShortRatioRanking: 應該依券資比由高到低排序，且不含融資餘額 <= 0 的公司', async () => {
  const result = await calculateMarginShortRatioRanking({ limit: 20 });
  assert.ok(result.tradeDate !== '', '應該找得到最新一個交易日');
  assert.ok(result.rankings.length > 0, '應該至少排得出幾筆');

  for (let i = 1; i < result.rankings.length; i++) {
    assert.ok(result.rankings[i - 1]!.shortToMarginRatioPct >= result.rankings[i]!.shortToMarginRatioPct, '應該由高到低排序');
  }
  result.rankings.forEach((row, index) => assert.equal(row.rank, index + 1));

  for (const row of result.rankings) {
    assert.ok(Number(row.marginTodayBalance) > 0, '融資餘額應該大於 0（分母不能是 0）');
    const expected = Math.round((Number(row.shortTodayBalance) / Number(row.marginTodayBalance)) * 100 * 100) / 100;
    assert.equal(row.shortToMarginRatioPct, expected);
  }
});

test('calculateMarginShortRatioRanking: limit 應該限制回傳筆數', async () => {
  const result = await calculateMarginShortRatioRanking({ limit: 3 });
  assert.ok(result.rankings.length <= 3);
});

// 2026-09-01 應使用者要求排除 ETF/衍生性商品（例如槓桿/反向 ETF）——只留真正的上市公司。
test('calculateMarginShortRatioRanking: 排行裡不應該出現 ETF/衍生性商品', async () => {
  const [result, companySymbols] = await Promise.all([calculateMarginShortRatioRanking({ limit: 100 }), getTwseCompanySymbolSet()]);
  for (const row of result.rankings) {
    assert.ok(companySymbols.has(row.symbol), `${row.symbol} 不在 company_profile 裡，應該已經被排除`);
  }
});

after(async () => {
  await twsePrisma.$disconnect();
});
