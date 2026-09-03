import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { calculateMarginShortRatioRanking } from '@/domainApi/market/marginShortRatioRanking/service';
import { twseExportPrisma } from '@/adapters/prisma/twseExportClient';
import tpexExportPrisma from '@/adapters/prisma/tpexExportClient';
import { getSecuritySymbolSet } from '@/shared/sourceData/companyProfile';

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

// 2026-09-01 應使用者要求排除 ETF/衍生性商品（例如槓桿/反向 ETF）——只留真正的上市櫃公司。
// 2026-09-04 合併進上櫃後，兩個市場的「真正公司」清單分開查，依每一列自己的 market 判斷。
test('calculateMarginShortRatioRanking: 排行裡不應該出現 ETF/衍生性商品', async () => {
  const [result, twseCompanySymbols, tpexCompanySymbols] = await Promise.all([
    calculateMarginShortRatioRanking({ limit: 100 }),
    getSecuritySymbolSet({ market: 'TWSE', preferredStock: 'exclude' }),
    getSecuritySymbolSet({ market: 'TPEx', preferredStock: 'exclude' }),
  ]);
  for (const row of result.rankings) {
    const companySymbols = row.market === 'TWSE' ? twseCompanySymbols : tpexCompanySymbols;
    assert.ok(companySymbols.has(row.symbol), `${row.symbol}（${row.market}）不在 company_profile 裡，應該已經被排除`);
  }
});

// 2026-09-04 合併進上櫃——tpex-ts 開了 export.margin_balance（source 是他們內部的
// tpex_mainboard_margin_balance），驗證合併結果裡真的看得到上櫃公司，不是只查了上市。
test('calculateMarginShortRatioRanking: 取夠大的 limit 時，應該同時看得到上市跟上櫃', async () => {
  const [result, tpexCountRows] = await Promise.all([
    calculateMarginShortRatioRanking({ limit: 100 }),
    tpexExportPrisma.$queryRaw<{ cnt: bigint }[]>`SELECT count(*)::bigint as cnt FROM "export"."margin_balance"`,
  ]);
  const tpexCount = Number(tpexCountRows[0]?.cnt ?? 0);
  if (tpexCount === 0) return; // tpex-ts 這個 dataset 還沒有資料時無從驗證，跳過。

  const hasTpex = result.rankings.some((row) => row.market === 'TPEx');
  assert.ok(hasTpex, '合併結果裡應該有上櫃公司（沒有代表還是只查了 TWSE），也可能是 TPEx 券資比排名剛好都排不進 limit 內，先確認資料量再判斷');
});

after(async () => {
  await twseExportPrisma.$disconnect();
  await tpexExportPrisma.$disconnect();
});
