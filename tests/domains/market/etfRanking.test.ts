import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { calculateEtfRanking } from '@/api/bff/market/etfRanking/service';
import sitcaExportPrisma from '@/adapters/prisma/sitcaExportClient';

test('calculateEtfRanking: aum desc 應該由大到小排序', async () => {
  const result = await calculateEtfRanking({ metric: 'aum', order: 'desc', limit: 10 });
  assert.ok(result.rankings.length > 0, '應該至少排得出幾筆');
  for (let i = 1; i < result.rankings.length; i++) {
    assert.ok(result.rankings[i - 1]!.value >= result.rankings[i]!.value, '應該由大到小排序');
  }
  result.rankings.forEach((row, index) => assert.equal(row.rank, index + 1));
});

// 2026-09-04 修過一次 bug：這裡原本沒有篩 year_month，剛好在 etf_monthly_statement 還只有
// 單一個月快照時測試碰巧成立——sitca-ts 累積超過一個月資料後，同一個 symbol 在這張表裡會有
// 多筆歷史快照，WHERE symbol = ANY(...) 篩到的月份不保證跟 calculateEtfRanking 內部用
// getLatestYearMonth() 決定的「最新月份」是同一筆，導致比對到不同月份的數字。改成明確篩
// 「跟 etf_basic_info 同一個最新 year_month」，跟正式程式碼用的判斷依據一致。
test('calculateEtfRanking: netFlow 應該等於申購金額減贖回金額', async () => {
  const result = await calculateEtfRanking({ metric: 'netFlow', order: 'desc', limit: 5 });
  assert.ok(result.rankings.length > 0);

  const rows = await sitcaExportPrisma.$queryRawUnsafe<{ symbol: string; subscription_amount_twd: bigint; redemption_amount_twd: bigint }[]>(
    `SELECT symbol, subscription_amount_twd, redemption_amount_twd FROM "export"."etf_monthly_statement"
     WHERE symbol = ANY($1) AND year_month = (SELECT MAX(year_month) FROM "export"."etf_basic_info")`,
    result.rankings.map((r) => r.symbol)
  );
  const bySymbol = new Map(rows.map((r) => [r.symbol, r]));
  for (const row of result.rankings) {
    const raw = bySymbol.get(row.symbol)!;
    assert.equal(row.value, Number(raw.subscription_amount_twd) - Number(raw.redemption_amount_twd));
  }
});

test('calculateEtfRanking: return1y asc 應該由小到大排序', async () => {
  const result = await calculateEtfRanking({ metric: 'return1y', order: 'asc', limit: 5 });
  for (let i = 1; i < result.rankings.length; i++) {
    assert.ok(result.rankings[i - 1]!.value <= result.rankings[i]!.value, '應該由小到大排序');
  }
});

test('calculateEtfRanking: expenseRatio 只採用最新一個完整年度，asOf 是去年', async () => {
  const result = await calculateEtfRanking({ metric: 'expenseRatio', order: 'asc', limit: 20 });
  const expectedYear = String(new Date().getFullYear() - 1);
  for (const row of result.rankings) {
    assert.equal(row.asOf, expectedYear, 'asOf 應該是最新一個完整年度');
  }
});

test('calculateEtfRanking: limit 應該限制回傳筆數', async () => {
  const result = await calculateEtfRanking({ metric: 'holders', order: 'desc', limit: 2 });
  assert.ok(result.rankings.length <= 2);
});

// 2026-09-04 sitca-ts 新增 is_actively_managed/aum_below_statutory_threshold 兩個欄位——
// 直接查真實資料交叉比對，確認這邊回傳的值就是來源表當下的值，不是搬過程中拿錯欄位或漏轉。
test('calculateEtfRanking: isActive/belowStatutoryThreshold 應該等於來源表當下的值', async () => {
  const result = await calculateEtfRanking({ metric: 'aum', order: 'desc', limit: 20 });
  assert.ok(result.rankings.length > 0);

  const basicRows = await sitcaExportPrisma.$queryRawUnsafe<{ symbol: string; is_actively_managed: boolean | null }[]>(
    `SELECT symbol, is_actively_managed FROM "export"."etf_basic_info" WHERE symbol = ANY($1) AND year_month = (SELECT MAX(year_month) FROM "export"."etf_basic_info")`,
    result.rankings.map((r) => r.symbol)
  );
  const statementRows = await sitcaExportPrisma.$queryRawUnsafe<{ symbol: string; aum_below_statutory_threshold: boolean | null }[]>(
    `SELECT symbol, aum_below_statutory_threshold FROM "export"."etf_monthly_statement" WHERE symbol = ANY($1) AND year_month = (SELECT MAX(year_month) FROM "export"."etf_basic_info")`,
    result.rankings.map((r) => r.symbol)
  );
  const isActiveBySymbol = new Map(basicRows.map((r) => [r.symbol, r.is_actively_managed]));
  const belowThresholdBySymbol = new Map(statementRows.map((r) => [r.symbol, r.aum_below_statutory_threshold]));

  for (const row of result.rankings) {
    assert.equal(row.isActive, isActiveBySymbol.get(row.symbol) ?? null, `${row.symbol} 的 isActive 應該跟來源表一致`);
    assert.equal(row.belowStatutoryThreshold, belowThresholdBySymbol.get(row.symbol) ?? null, `${row.symbol} 的 belowStatutoryThreshold 應該跟來源表一致`);
  }
});

afterAll(async () => {
  await sitcaExportPrisma.$disconnect();
});
