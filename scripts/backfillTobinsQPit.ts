// 2026-09-11：托賓Q值，只回補 2330 最新一筆驗證。
//
// 用法：pnpm tsx scripts/backfillTobinsQPit.ts
import { computeAndWriteTobinsQPit } from '../src/bootstrap/pitMetrics';
import { metricDefinitionRegistry, upsertMetricDefinition } from '../src/bootstrap/metricDefinitions';
import { disconnectAllDbs } from '../src/bootstrap/db';
import { reportAvailability } from '../src/bootstrap/scripts';

const SYMBOLS = ['2330'];

const main = async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.tobinsQ!);

  for (const symbol of SYMBOLS) {
    const query = { symbol, dataType: await reportAvailability.resolveDataType(symbol), subsidiaryCompanyId: '' };
    console.log(`[tobins-q-pit] ${symbol}: ${JSON.stringify(await computeAndWriteTobinsQPit(query))}`);
  }
};

main()
  .catch((error) => {
    console.error('tobinsQ backfill 腳本執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectAllDbs();
  });
