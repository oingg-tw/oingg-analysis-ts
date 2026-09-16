// 2026-09-10：Titman, Wei & Xie (2004) 異常資本投資比率，只回補 2330 最新一筆。
//
// 用法：pnpm tsx scripts/backfillAbnormalCapexRatioPit.ts
import { computeAndWriteAbnormalCapexRatioPit } from '../src/bootstrap/pitMetrics';
import { upsertMetricDefinition, metricDefinitionRegistry } from '../src/application/metrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '../src/infrastructure/prisma/mopsExportClient';
import { analysisPrisma } from '../src/infrastructure/prisma/analysisClient';

const SYMBOLS = ['2330'];

const main = async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.abnormalCapexRatio!);

  for (const symbol of SYMBOLS) {
    const query = { symbol, dataType: '2' as const, subsidiaryCompanyId: '' };
    console.log(`[abnormal-capex-ratio-pit] ${symbol}: ${JSON.stringify(await computeAndWriteAbnormalCapexRatioPit(query))}`);
  }
};

main()
  .catch((error) => {
    console.error('abnormalCapexRatio backfill 腳本執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mopsExportPrisma.$disconnect();
    await analysisPrisma.$disconnect();
  });
