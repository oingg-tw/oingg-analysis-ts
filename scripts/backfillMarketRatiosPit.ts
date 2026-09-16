// MarketRatios（exchangePeRatio/exchangePbRatio/dividendYield）遷入 pitMetrics 的回填
// 腳本——沿用 backfillPeRatioAndPbRatioPit.ts 的先例，只做 2330 這一家（使用者已經拍板
// 「全市場逐日回填基礎設施」暫不擴大，2330 就好）。
//
// 跟季報型指標的回填不同：這是逐日型指標，要走的是「這個 symbol 在 daily_valuation
// 裡的每一個交易日」，不是「每一季」——直接查 distinct trade_date 清單，逐日呼叫
// computeAndWriteMarketRatiosPit，沿用它自己的 getDailyValuationAsOf(symbol, date)
// 做「該日期或之前」最新一筆的查詢（剛好對到精確日期本身，等於直接抓那天的值）。
//
// 用法：pnpm tsx scripts/backfillMarketRatiosPit.ts

import { computeAndWriteMarketRatiosPit } from '../src/domainPitMetrics/shared/marketRatios/computeMarketRatiosPit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '../src/domainPitMetrics/metricDefinitionRegistry';
import { twseExportPrisma } from '../src/infrastructure/prisma/twseExportClient';
import { analysisPrisma } from '../src/infrastructure/prisma/analysisClient';

const SYMBOLS = ['2330'];

const getTradeDates = async (symbol: string): Promise<Date[]> => {
  const rows = await twseExportPrisma.$queryRaw<Array<{ trade_date: Date }>>`
    SELECT DISTINCT trade_date FROM "export"."daily_valuation" WHERE symbol = ${symbol} ORDER BY trade_date ASC
  `;
  return rows.map((r) => r.trade_date);
};

const main = async () => {
  await Promise.all(['exchangePeRatio', 'exchangePbRatio', 'dividendYield'].map((code) => upsertMetricDefinition(metricDefinitionRegistry[code]!)));

  for (const symbol of SYMBOLS) {
    const tradeDates = await getTradeDates(symbol);
    console.log(`[market-ratios-pit] ${symbol}: ${tradeDates.length} 個交易日`);

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const tradeDate of tradeDates) {
      const outcome = await computeAndWriteMarketRatiosPit({ symbol, date: tradeDate, dataType: '2', subsidiaryCompanyId: '' });
      for (const result of [outcome.exchangePeRatio, outcome.exchangePbRatio, outcome.dividendYield]) {
        if (result.action === 'inserted') inserted++;
        else if (result.action === 'updated_same_knowledge_date') updated++;
        else skipped++;
      }
    }

    console.log(`[market-ratios-pit] ${symbol}: inserted=${inserted} updated=${updated} skipped/other=${skipped}`);
  }
};

main()
  .catch((error) => {
    console.error('MarketRatios pit 回填腳本執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await twseExportPrisma.$disconnect();
    await analysisPrisma.$disconnect();
  });
