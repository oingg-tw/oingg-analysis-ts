// 2026-09-10 使用者要求：營業費用率。只回補 2330 最新一筆驗證。
//
// 用法：pnpm tsx scripts/backfillOperatingExpenseRatioPit.ts
import { computeAndWriteOperatingExpenseRatioPit } from '../src/bootstrap/pitMetrics';
import { metricDefinitionRegistry, upsertMetricDefinition } from '../src/bootstrap/metricDefinitions';
import { disconnectAllDbs } from '../src/bootstrap/db';

const SYMBOLS = ['2330'];

const main = async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.operatingExpenseRatio!);

  for (const symbol of SYMBOLS) {
    const query = { symbol, dataType: '2' as const, subsidiaryCompanyId: '' };
    console.log(`[operating-expense-ratio-pit] ${symbol}: ${JSON.stringify(await computeAndWriteOperatingExpenseRatioPit(query))}`);
  }
};

main()
  .catch((error) => {
    console.error('operatingExpenseRatio backfill 腳本執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectAllDbs();
  });
