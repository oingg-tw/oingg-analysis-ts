// 2026-09-07 使用者要求：本益比/本淨比/四季 EPS，以 2330 為範例，時間區間可變動（例如
// 五年），做好給前端接個股瀏覽畫面。
//
// 這支腳本**不沿用**共用的 scripts/pitBackfillFixtures.ts（那組是 113Q3~115Q2 共 8 季，
// 給其他既有批次共用，改動它會讓其他批次的既有測試基準跟著變動範圍）——自己定義
// 110Q3~115Q2 共 20 季（5 年），只做 2330 這一家（使用者說的範例，之後要擴大到其他股票
// 是後續的事）。直接查證過這 20 季 2330 的 quarterly_balance_sheet/quarterly_income_statement
// 完全沒有缺季、daily_price 從 2021-08-31 開始（早於 110Q3 期末，價格資料足夠涵蓋）。
//
// 除了 peRatio/pbRatio 本身，也把 eps/bvps 往回補到同樣的 20 季範圍——這兩支目前只
// backfill 到 113Q3（2 年），需要跟 peRatio/pbRatio 涵蓋同樣的 5 年範圍，前端才能同時
// 顯示三者的完整時序。113Q3~115Q2 這段既有已經 backfill 過的資料重跑會自然變成
// skipped_unchanged（writeMetricValue 內建去重語意），不會壞掉既有資料。
//
// 用法：pnpm tsx scripts/backfillPeRatioAndPbRatioPit.ts

import { computeAndWriteEpsPit } from '../src/pitMetrics/eps/computeEpsPit';
import { computeAndWriteBvpsPit } from '../src/pitMetrics/bvps/computeBvpsPit';
import { computeAndWritePeRatioPit } from '../src/pitMetrics/peRatio/computePeRatioPit';
import { computeAndWritePbRatioPit } from '../src/pitMetrics/pbRatio/computePbRatioPit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '../src/pitMetrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '../src/adapters/prisma/mopsExportClient';
import { twseExportPrisma } from '../src/adapters/prisma/twseExportClient';
import { analysisPrisma } from '../src/adapters/prisma/analysisClient';

const SYMBOLS = ['2330'];

// 110Q3 ~ 115Q2（民國年/季），舊到新排列——2330 這 20 季完全沒有缺季（2026-09-07 直接
// 查證過）。
const QUARTERS: { year: string; season: '1' | '2' | '3' | '4' }[] = [
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
  await Promise.all(['eps', 'bvps', 'peRatio', 'pbRatio'].map((code) => upsertMetricDefinition(metricDefinitionRegistry[code]!)));

  for (const symbol of SYMBOLS) {
    for (const { year, season } of QUARTERS) {
      const query = { symbol, year, season, dataType: '2' as const, subsidiaryCompanyId: '' };

      const epsOutcome = await computeAndWriteEpsPit(query);
      console.log(`[eps-pit] ${symbol} ${year}Q${season}: q=${JSON.stringify(epsOutcome.q)} ttm=${JSON.stringify(epsOutcome.ttm)}`);

      const bvpsOutcome = await computeAndWriteBvpsPit(query);
      console.log(`[bvps-pit] ${symbol} ${year}Q${season}: q=${JSON.stringify(bvpsOutcome.q)}`);

      const peRatioOutcome = await computeAndWritePeRatioPit(query);
      console.log(`[pe-ratio-pit] ${symbol} ${year}Q${season}: ttm=${JSON.stringify(peRatioOutcome.ttm)}`);

      const pbRatioOutcome = await computeAndWritePbRatioPit(query);
      console.log(`[pb-ratio-pit] ${symbol} ${year}Q${season}: q=${JSON.stringify(pbRatioOutcome.q)}`);
    }
  }
};

main()
  .catch((error) => {
    console.error('peRatio/pbRatio backfill 腳本執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mopsExportPrisma.$disconnect();
    await twseExportPrisma.$disconnect();
    await analysisPrisma.$disconnect();
  });
