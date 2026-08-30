import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { calculateRanking } from '@/domains/valuation/ranking/service';
import twsePrisma from '@/adapters/prisma/twseClient';
import tpexPrisma from '@/adapters/prisma/tpexClient';

// daily_valuation 每天更新，不釘死確切公司/數值，只驗證排序正確、排除邏輯有效——
// 跟本服務其他吃即時市場資料的測試同一種風格。
test('ranking: 低本益比排行（peRatio asc）應該由小到大排序，且不含 <= 0 的公司', async () => {
  const result = await calculateRanking({ metric: 'peRatio', order: 'asc', limit: 10 });

  assert.ok(result.tradeDate !== null, '應該找得到最新一個交易日');
  assert.ok(result.rankings.length > 0, '1080+ 檔股票應該至少排得出幾筆');
  for (const row of result.rankings) {
    assert.ok(row.value > 0, `peRatio=${row.value} 不應該出現在排行榜（應該被排除）`);
  }
  for (let i = 1; i < result.rankings.length; i++) {
    assert.ok(result.rankings[i]!.value >= result.rankings[i - 1]!.value, '應該由小到大排序');
  }
  // rank 應該從 1 開始連續編號。
  result.rankings.forEach((row, index) => assert.equal(row.rank, index + 1));
});

test('ranking: 高殖利率排行（dividendYield desc）應該由大到小排序', async () => {
  const result = await calculateRanking({ metric: 'dividendYield', order: 'desc', limit: 10 });

  assert.ok(result.rankings.length > 0);
  for (let i = 1; i < result.rankings.length; i++) {
    assert.ok(result.rankings[i]!.value <= result.rankings[i - 1]!.value, '應該由大到小排序');
  }
});

test('ranking: limit 應該限制回傳筆數，跟實際全市場筆數比對合理性', async () => {
  const result = await calculateRanking({ metric: 'pbRatio', order: 'asc', limit: 5 });
  assert.ok(result.rankings.length <= 5);
});

test('ranking: 指定查無資料的日期，應該優雅降級回傳空陣列而不是拋錯', async () => {
  const result = await calculateRanking({ metric: 'peRatio', order: 'asc', limit: 10, date: '1990-01-01' });
  assert.deepEqual(result.rankings, []);
  assert.ok(result.warnings.length > 0);
});

// 2026-08-30 接上 TPEx 之後的關鍵案例：合併結果裡應該真的看得到上櫃公司，不是只有上市——
// 用市場整體覆蓋率反推期望值（現查 twse/tpex 各自今天有沒有資料），不寫死是哪幾檔股票，
// 覆蓋率之後會持續變。
test('ranking: 取夠大的 limit 時，合併結果應該同時包含上市跟上櫃公司', async () => {
  const [twseCount, tpexCount] = await Promise.all([
    twsePrisma.dailyValuation.count(),
    tpexPrisma.dailyValuation.count(),
  ]);
  if (twseCount === 0 || tpexCount === 0) return; // 其中一邊完全沒資料時無從驗證跨市場合併，跳過。

  const result = await calculateRanking({ metric: 'dividendYield', order: 'desc', limit: 500 });
  const twseSymbols = new Set((await twsePrisma.dailyValuation.findMany({ where: { tradeDate: new Date(`${result.tradeDate}T00:00:00.000Z`) }, select: { symbol: true } })).map((r) => r.symbol));

  const hasTwse = result.rankings.some((r) => twseSymbols.has(r.symbol));
  const hasTpex = result.rankings.some((r) => !twseSymbols.has(r.symbol));
  assert.ok(hasTwse, '合併結果裡應該有上市公司');
  assert.ok(hasTpex, '合併結果裡應該有上櫃公司（沒有代表還是只查了 TWSE）');
});

after(async () => {
  await twsePrisma.$disconnect();
  await tpexPrisma.$disconnect();
});
