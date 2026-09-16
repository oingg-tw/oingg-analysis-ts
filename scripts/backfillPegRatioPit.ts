// 2026-09-11：本益成長比（PEG），只回補 2330 最新一筆。
//
// 用法：pnpm tsx scripts/backfillPegRatioPit.ts
import { computeAndWritePegRatioPit } from '../src/bootstrap/pitMetrics';
import { metricDefinitionRegistry } from '../src/application/metrics/metricDefinitionRegistry';
import { upsertMetricDefinition } from '../src/bootstrap/metricDefinitions';
import { mopsExportPrisma } from '../src/infrastructure/prisma/mopsExportClient';
import { analysisPrisma } from '../src/infrastructure/prisma/analysisClient';

const SYMBOLS = ['2330'];

const main = async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.pegRatio!);

  for (const symbol of SYMBOLS) {
    const query = { symbol, dataType: '2' as const, subsidiaryCompanyId: '' };
    console.log(`[peg-ratio-pit] ${symbol}: ${JSON.stringify(await computeAndWritePegRatioPit(query))}`);
  }
};

main()
  .catch((error) => {
    console.error('pegRatio backfill 腳本執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mopsExportPrisma.$disconnect();
    await analysisPrisma.$disconnect();
  });
