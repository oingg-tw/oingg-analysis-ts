// 2026-09-07 使用者要求：本益比/本淨比/四季 EPS，以 2330 為範例，時間區間可變動（例如
// 五年），做好給前端接個股瀏覽畫面。
//
// 這支腳本**不沿用**共用的 scripts/pitBackfillFixtures.ts（那組是 113Q3~115Q2 共 8 季，
// 給其他既有批次共用，改動它會讓其他批次的既有測試基準跟著變動範圍）——自己定義
// 109Q4~115Q2 共 23 季，只做 2330 這一家（使用者說的範例，之後要擴大到其他股票是後續
// 的事）。
//
// 2026-09-07 追加 109Q4~110Q2 這 3 季（原本只有 110Q3~115Q2 共 20 季）——前端河流圖
// 需要「往前 3 季的緩衝資料」才能在起點畫出統計意義上合理的百分位帶，這 3 季就是那個
// 緩衝。twse-ts 把 daily_price 全市場往前補到 2020-11-01（2330 實際最早交易日
// 2020-11-02）後才解除這個瓶頸——之前卡在股價資料只到 2021-08-31，capital_stock_history/
// quarterly_income_statement_xbrl 早就沒問題（分別回溯到 1991 年/民國 108 年）。
//
// 除了 peRatio/pbRatio 本身，也把 eps/bvps 往回補到同樣的範圍——這兩支目前只 backfill
// 到 113Q3（2 年），需要跟 peRatio/pbRatio 涵蓋同樣的範圍，前端才能同時顯示三者的完整
// 時序。已經 backfill 過的季度重跑會自然變成 skipped_unchanged（writeMetricValue 內建
// 去重語意），不會壞掉既有資料。
//
// 用法：pnpm tsx scripts/backfillPeRatioAndPbRatioPit.ts
import { computeAndWriteBvpsPit, computeAndWriteEpsPit, computeAndWritePbRatioPit, computeAndWritePeRatioPit } from '../src/bootstrap/pitMetrics';
import { metricDefinitionRegistry } from '../src/application/metrics/metricDefinitionRegistry';
import { upsertMetricDefinition } from '../src/bootstrap/metricDefinitions';
import { mopsExportPrisma } from '../src/infrastructure/prisma/mopsExportClient';
import { twseExportPrisma } from '../src/infrastructure/prisma/twseExportClient';
import { analysisPrisma } from '../src/infrastructure/prisma/analysisClient';

const SYMBOLS = ['2330'];

// 109Q4 ~ 115Q2（民國年/季），舊到新排列。
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
