// 2026-09-11：本益成長比（PEG），只回補 2330 最新一筆。
//
// 用法：pnpm tsx scripts/backfillPegRatioPit.ts
import { computeAndWritePegRatioPit } from '../src/bootstrap/pitMetrics';
import { metricDefinitionRegistry, upsertMetricDefinition } from '../src/bootstrap/metricDefinitions';
import { disconnectAllDbs } from '../src/bootstrap/db';
import { reportAvailability } from '../src/bootstrap/scripts';

const SYMBOLS = ['2330'];

const main = async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.pegRatio!);

  for (const symbol of SYMBOLS) {
    const query = { symbol, dataType: await reportAvailability.resolveDataType(symbol), subsidiaryCompanyId: '' };
    console.log(`[peg-ratio-pit] ${symbol}: ${JSON.stringify(await computeAndWritePegRatioPit(query))}`);
  }
};

main()
  .catch((error) => {
    console.error('pegRatio backfill 腳本執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectAllDbs();
  });
