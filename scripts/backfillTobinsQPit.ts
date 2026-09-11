// 2026-09-11：托賓Q值，只回補 2330 最新一筆驗證。
//
// 用法：pnpm tsx scripts/backfillTobinsQPit.ts

import { computeAndWriteTobinsQPit } from '../src/domainPitMetrics/valuation/tobinsQ/computeTobinsQPit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '../src/domainPitMetrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '../src/adapters/prisma/mopsExportClient';
import { twseExportPrisma } from '../src/adapters/prisma/twseExportClient';
import { analysisPrisma } from '../src/adapters/prisma/analysisClient';

const SYMBOLS = ['2330'];

const main = async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.tobinsQ!);

  for (const symbol of SYMBOLS) {
    const query = { symbol, dataType: '2' as const, subsidiaryCompanyId: '' };
    console.log(`[tobins-q-pit] ${symbol}: ${JSON.stringify(await computeAndWriteTobinsQPit(query))}`);
  }
};

main()
  .catch((error) => {
    console.error('tobinsQ backfill 腳本執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mopsExportPrisma.$disconnect();
    await twseExportPrisma.$disconnect();
    await analysisPrisma.$disconnect();
  });
