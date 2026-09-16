// 2026-09-10 使用者要求：Altman Z-Score 分開三版本實作（Z 原版已有，補上 Z″）。
// 只回補 2330 最新一筆驗證。
// 2026-09-13：Z′-Score 整支指標已刪除（設計前提「沒有股價的非上市公司」在本資料庫從未
// 成立，全面標記 not_applicable_industry 只是延後死刑，不如直接下線），這支腳本只剩 Z″。
//
// 用法：pnpm tsx scripts/backfillAltmanZVariantsPit.ts

import { computeAndWriteAltmanZDoublePrimeScorePit } from '../src/application/metrics/resilience/altmanZDoublePrimeScore/computeAltmanZDoublePrimeScorePit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '../src/application/metrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '../src/infrastructure/prisma/mopsExportClient';
import { analysisPrisma } from '../src/infrastructure/prisma/analysisClient';

const SYMBOLS = ['2330'];

const main = async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.altmanZDoublePrimeScore!);

  for (const symbol of SYMBOLS) {
    const query = { symbol, dataType: '2' as const, subsidiaryCompanyId: '' };
    console.log(`[altman-z-double-prime-score-pit] ${symbol}: ${JSON.stringify(await computeAndWriteAltmanZDoublePrimeScorePit(query))}`);
  }
};

main()
  .catch((error) => {
    console.error('Altman Z 變體 backfill 腳本執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mopsExportPrisma.$disconnect();
    await analysisPrisma.$disconnect();
  });
