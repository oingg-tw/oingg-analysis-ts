// 2026-09-10：市值指標，只回補 2330 最新一筆——理由跟這個 session 其他 backfill 腳本一致。
//
// 用法：pnpm tsx scripts/backfillMarketCapPit.ts

import { computeAndWriteMarketCapPit } from '../src/domainPitMetrics/valuation/marketCap/computeMarketCapPit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '../src/domainPitMetrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '../src/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '../src/adapters/prisma/analysisClient';

const SYMBOLS = ['2330'];

const main = async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.marketCap!);

  for (const symbol of SYMBOLS) {
    const query = { symbol, dataType: '2' as const, subsidiaryCompanyId: '' };
    console.log(`[market-cap-pit] ${symbol}: ${JSON.stringify(await computeAndWriteMarketCapPit(query))}`);
  }
};

main()
  .catch((error) => {
    console.error('marketCap backfill 腳本執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mopsExportPrisma.$disconnect();
    await analysisPrisma.$disconnect();
  });
