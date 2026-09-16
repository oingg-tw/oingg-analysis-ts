// 2026-09-10 使用者要求：SUE（標準化未預期盈餘）。只回補 2330 最新一筆驗證。
//
// 用法：pnpm tsx scripts/backfillSuePit.ts
import { computeAndWriteSuePit } from '../src/bootstrap/pitMetrics';
import { upsertMetricDefinition, metricDefinitionRegistry } from '../src/application/metrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '../src/infrastructure/prisma/mopsExportClient';
import { analysisPrisma } from '../src/infrastructure/prisma/analysisClient';

const SYMBOLS = ['2330'];

const main = async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.sue!);

  for (const symbol of SYMBOLS) {
    const query = { symbol, dataType: '2' as const, subsidiaryCompanyId: '' };
    console.log(`[sue-pit] ${symbol}: ${JSON.stringify(await computeAndWriteSuePit(query))}`);
  }
};

main()
  .catch((error) => {
    console.error('sue backfill 腳本執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mopsExportPrisma.$disconnect();
    await analysisPrisma.$disconnect();
  });
