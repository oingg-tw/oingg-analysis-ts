// 2026-09-10 使用者要求：研發費用率。只回補 2330 最新一筆驗證。
//
// 用法：pnpm tsx scripts/backfillRdIntensityPit.ts

import { computeAndWriteRdIntensityPit } from '../src/application/metrics/growth/rdIntensity/computeRdIntensityPit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '../src/application/metrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '../src/infrastructure/prisma/mopsExportClient';
import { analysisPrisma } from '../src/infrastructure/prisma/analysisClient';

const SYMBOLS = ['2330'];

const main = async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.rdIntensity!);

  for (const symbol of SYMBOLS) {
    const query = { symbol, dataType: '2' as const, subsidiaryCompanyId: '' };
    console.log(`[rd-intensity-pit] ${symbol}: ${JSON.stringify(await computeAndWriteRdIntensityPit(query))}`);
  }
};

main()
  .catch((error) => {
    console.error('rdIntensity backfill 腳本執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mopsExportPrisma.$disconnect();
    await analysisPrisma.$disconnect();
  });
