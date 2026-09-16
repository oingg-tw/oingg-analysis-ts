// 2026-09-07 新增 stockPrice metric_code，給 web-nuxt 河流圖直接讀 peRatio/pbRatio 用的
// 實際股價（見 src/domainPitMetrics/valuation/stockPrice/computeStockPricePit.ts 的說明）。跟其他 2330
// 5 年擴充批次（backfillPeRatioAndPbRatioPit.ts 等）同一個範圍——109Q4~115Q2 共 23 季，
// 只做 2330（目前唯一有這批擴充範圍資料的公司）。
//
// 用法：pnpm tsx scripts/backfillStockPricePit.ts
import { computeAndWriteStockPricePit } from '../src/bootstrap/pitMetrics';
import { metricDefinitionRegistry, upsertMetricDefinition } from '../src/bootstrap/metricDefinitions';
import { disconnectAllDbs } from '../src/bootstrap/db';

const SYMBOLS = ['2330'];

const QUARTERS: { year: string; season: '1' | '2' | '3' | '4' }[] = [
  { year: '109', season: '4' },
  { year: '110', season: '1' },
  { year: '110', season: '2' },
  { year: '110', season: '3' },
  { year: '110', season: '4' },
  { year: '111', season: '1' },
  { year: '111', season: '2' },
  { year: '111', season: '3' },
  { year: '111', season: '4' },
  { year: '112', season: '1' },
  { year: '112', season: '2' },
  { year: '112', season: '3' },
  { year: '112', season: '4' },
  { year: '113', season: '1' },
  { year: '113', season: '2' },
  { year: '113', season: '3' },
  { year: '113', season: '4' },
  { year: '114', season: '1' },
  { year: '114', season: '2' },
  { year: '114', season: '3' },
  { year: '114', season: '4' },
  { year: '115', season: '1' },
  { year: '115', season: '2' },
];

const main = async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.stockPrice!);

  for (const symbol of SYMBOLS) {
    for (const { year, season } of QUARTERS) {
      const outcome = await computeAndWriteStockPricePit({ symbol, year, season, dataType: '2' as const, subsidiaryCompanyId: '' });
      console.log(`[stock-price-pit] ${symbol} ${year}Q${season}: q=${JSON.stringify(outcome.q)}`);
    }
  }
};

main()
  .catch((error) => {
    console.error('stockPrice backfill 腳本執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectAllDbs();
  });
