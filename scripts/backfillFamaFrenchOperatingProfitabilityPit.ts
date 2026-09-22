// 2026-09-10 使用者要求：Fama-French RMW 因子背後的單一公司營業獲利力比率。只回補 2330 最新一筆驗證。
//
// 用法：pnpm tsx scripts/backfillFamaFrenchOperatingProfitabilityPit.ts
import { computeAndWriteFamaFrenchOperatingProfitabilityPit } from '../src/bootstrap/pitMetrics';
import { metricDefinitionRegistry, upsertMetricDefinition } from '../src/bootstrap/metricDefinitions';
import { disconnectAllDbs } from '../src/bootstrap/db';
import { reportAvailability } from '../src/bootstrap/scripts';

const SYMBOLS = ['2330'];

const main = async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.famaFrenchOperatingProfitability!);

  for (const symbol of SYMBOLS) {
    const query = { symbol, dataType: await reportAvailability.resolveDataType(symbol), subsidiaryCompanyId: '' };
    console.log(`[fama-french-operating-profitability-pit] ${symbol}: ${JSON.stringify(await computeAndWriteFamaFrenchOperatingProfitabilityPit(query))}`);
  }
};

main()
  .catch((error) => {
    console.error('famaFrenchOperatingProfitability backfill 腳本執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectAllDbs();
  });
