// 2026-09-10 使用者要求：Chowder Number。只回補 2330 最新一筆驗證。
//
// 用法：pnpm tsx scripts/backfillChowderNumberPit.ts
import { computeAndWriteChowderNumberPit } from '../src/bootstrap/pitMetrics';
import { metricDefinitionRegistry, upsertMetricDefinition } from '../src/bootstrap/metricDefinitions';
import { disconnectAllDbs } from '../src/bootstrap/db';
import { reportAvailability } from '../src/bootstrap/scripts';

const SYMBOLS = ['2330'];

const main = async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.chowderNumber!);

  for (const symbol of SYMBOLS) {
    const query = { symbol, dataType: await reportAvailability.resolveDataType(symbol), subsidiaryCompanyId: '' };
    console.log(`[chowder-number-pit] ${symbol}: ${JSON.stringify(await computeAndWriteChowderNumberPit(query))}`);
  }
};

main()
  .catch((error) => {
    console.error('chowderNumber backfill 腳本執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectAllDbs();
  });
