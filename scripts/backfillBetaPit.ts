// Beta 遷入 pitMetrics 的回填腳本——沿用 backfillMarketRatiosPit.ts 的先例，只做 2330
// 這一家（使用者已經拍板「全市場逐日回填基礎設施」暫不擴大，2330 就好）。
//
// 逐日型指標，走的是「這個 symbol 在 daily_price 裡的每一個交易日」，不是「每一季」——
// 直接查 distinct trade_date 清單，逐日呼叫 computeAndWriteBetaPit（它自己會用
// getDailyValuationAsOf 同款「該日期或之前」邏輯抓 5 年回溯窗口）。
//
// 注意：每次呼叫都會重新查一次最多 5 年的 daily_price/daily_taiex_index 範圍（Beta
// 計算本身需要這麼多資料才能算三個窗口），1416 個交易日會產生大量重複查詢，預期比
// MarketRatios 那支慢很多——這是 Beta 計算本身的成本，不是腳本寫法的問題。
//
// 用法：pnpm tsx scripts/backfillBetaPit.ts

import { computeAndWriteBetaPit } from '../src/domainPitMetrics/valuation/beta/computeBetaPit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '../src/domainPitMetrics/metricDefinitionRegistry';
import { twseExportPrisma } from '../src/infrastructure/prisma/twseExportClient';
import { analysisPrisma } from '../src/infrastructure/prisma/analysisClient';

const SYMBOLS = ['2330'];

const getTradeDates = async (symbol: string): Promise<Date[]> => {
  const rows = await twseExportPrisma.$queryRaw<Array<{ trade_date: Date }>>`
    SELECT DISTINCT trade_date FROM "export"."daily_price" WHERE symbol = ${symbol} ORDER BY trade_date ASC
  `;
  return rows.map((r) => r.trade_date);
};

const main = async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.beta!);

  for (const symbol of SYMBOLS) {
    const tradeDates = await getTradeDates(symbol);
    console.log(`[beta-pit] ${symbol}: ${tradeDates.length} 個交易日`);

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let processed = 0;

    for (const tradeDate of tradeDates) {
      const outcome = await computeAndWriteBetaPit({ symbol, date: tradeDate, dataType: '2', subsidiaryCompanyId: '' });
      for (const result of [outcome.beta1YDaily, outcome.beta2YWeekly, outcome.beta3YWeekly, outcome.beta5YMonthly]) {
        if (result.action === 'inserted') inserted++;
        else if (result.action === 'updated_same_knowledge_date') updated++;
        else skipped++;
      }
      processed++;
      if (processed % 100 === 0) {
        console.log(`[beta-pit] ${symbol}: 進度 ${processed}/${tradeDates.length}`);
      }
    }

    console.log(`[beta-pit] ${symbol}: inserted=${inserted} updated=${updated} skipped/other=${skipped}`);
  }
};

main()
  .catch((error) => {
    console.error('Beta pit 回填腳本執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await twseExportPrisma.$disconnect();
    await analysisPrisma.$disconnect();
  });
