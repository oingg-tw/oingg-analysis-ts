// 2026-09-07 使用者發現 2330 的 roe/roa/dupont 家族只 backfill 到 113Q3~115Q2（8 季/2年，
// 原本 ROE spike 那批的範圍），但同一支股票的 eps/bvps/peRatio/pbRatio 已經擴充到
// 110Q3~115Q2（20 季/5年，見 backfillPeRatioAndPbRatioPit.ts）——前端同一個個股頁面
// 顯示這幾個指標時，使用者會看到 ROE/ROA 比 EPS/PE/PB 少 3 年資料，是真實缺口不是誤會。
// 這支腳本把 2330 的 roe/roa/dupont 也補到同樣的 20 季範圍，讓同一家公司的 PIT 指標
// 涵蓋範圍一致。只做 2330（使用者這次只要求擴充這一家），不動 2887/2317 這兩個既有
// 對照組（不在這次範圍內，需要的話另外處理）。
//
// 用法：pnpm tsx scripts/backfillRoeRoaDupont5YearPit.ts

import { computeAndWriteRoePit } from '../src/pitMetrics/roe/computeRoePit';
import { computeAndWriteRoaPit } from '../src/pitMetrics/roa/computeRoaPit';
import { computeAndWriteDupontFamilyPit } from '../src/pitMetrics/dupont/computeDupontFamilyPit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '../src/pitMetrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '../src/adapters/prisma/mopsExportClient';
import { twseExportPrisma } from '../src/adapters/prisma/twseExportClient';
import { analysisPrisma } from '../src/adapters/prisma/analysisClient';

const SYMBOLS = ['2330'];

// 110Q3 ~ 115Q2（民國年/季），跟 backfillPeRatioAndPbRatioPit.ts 同一個範圍，舊到新排列。
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
  await Promise.all(
    ['roe', 'roa', 'netProfitMargin', 'assetTurnover', 'equityMultiplier', 'dupontDecomposedRoe'].map((code) => upsertMetricDefinition(metricDefinitionRegistry[code]!))
  );

  for (const symbol of SYMBOLS) {
    for (const { year, season } of QUARTERS) {
      const query = { symbol, year, season, dataType: '2' as const, subsidiaryCompanyId: '' };

      const roeOutcome = await computeAndWriteRoePit(query);
      console.log(`[roe-pit] ${symbol} ${year}Q${season}: q=${JSON.stringify(roeOutcome.q)} ttm=${JSON.stringify(roeOutcome.ttm)}`);

      const roaOutcome = await computeAndWriteRoaPit(query);
      console.log(`[roa-pit] ${symbol} ${year}Q${season}: q=${JSON.stringify(roaOutcome.q)} ttm=${JSON.stringify(roaOutcome.ttm)}`);

      const dupontOutcome = await computeAndWriteDupontFamilyPit(query);
      console.log(
        `[dupont-pit] ${symbol} ${year}Q${season}: npm=${JSON.stringify(dupontOutcome.netProfitMarginQ)} at=${JSON.stringify(dupontOutcome.assetTurnoverQ)} decomposedRoe=${JSON.stringify(dupontOutcome.dupontDecomposedRoeQ)}`
      );
    }
  }
};

main()
  .catch((error) => {
    console.error('roe/roa/dupont 5 年擴充 backfill 腳本執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mopsExportPrisma.$disconnect();
    await twseExportPrisma.$disconnect();
    await analysisPrisma.$disconnect();
  });
