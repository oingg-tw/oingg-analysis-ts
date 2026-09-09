// 2026-09-10 使用者對照外部指標清單問「還有哪些指標沒做」，選出三支資料已連好、可以
// 複製既有模式直接做的：assetGrowth（跟 equityGrowthRate 同模式）、consecutiveProfitYears
// （跟 consecutiveDividendYears 同模式）、earningsYield（peRatio 倒數）。只回補 2330
// 最新一筆驗證。
//
// 用法：pnpm tsx scripts/backfillQuickWinsPit.ts

import { computeAndWriteAssetGrowthPit } from '../src/domainPitMetrics/growth/assetGrowth/computeAssetGrowthPit';
import { computeAndWriteConsecutiveProfitYearsPit } from '../src/domainPitMetrics/profitability/consecutiveProfitYears/computeConsecutiveProfitYearsPit';
import { computeAndWriteEarningsYieldPit } from '../src/domainPitMetrics/valuation/earningsYield/computeEarningsYieldPit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '../src/domainPitMetrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '../src/adapters/prisma/mopsExportClient';
import { twseExportPrisma } from '../src/adapters/prisma/twseExportClient';
import { analysisPrisma } from '../src/adapters/prisma/analysisClient';

const SYMBOLS = ['2330'];

// 跟其他批次同一個季度範圍（109Q4 ~ 115Q2）。
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
  await Promise.all(
    ['assetGrowth', 'consecutiveProfitYears', 'earningsYield'].map((code) => upsertMetricDefinition(metricDefinitionRegistry[code]!))
  );

  for (const symbol of SYMBOLS) {
    for (const { year, season } of QUARTERS) {
      const query = { symbol, year, season, dataType: '2' as const, subsidiaryCompanyId: '' };

      console.log(`[asset-growth-pit] ${symbol} ${year}Q${season}: ${JSON.stringify(await computeAndWriteAssetGrowthPit(query))}`);
      console.log(`[earnings-yield-pit] ${symbol} ${year}Q${season}: ${JSON.stringify(await computeAndWriteEarningsYieldPit(query))}`);
    }
    // consecutiveProfitYears 是 FY 週期概念，不需要逐季回補，只查最新一次即可。
    const latestQuery = { symbol, dataType: '2' as const, subsidiaryCompanyId: '' };
    console.log(`[consecutive-profit-years-pit] ${symbol}: ${JSON.stringify(await computeAndWriteConsecutiveProfitYearsPit(latestQuery))}`);
  }
};

main()
  .catch((error) => {
    console.error('quick-wins 三支指標 backfill 腳本執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mopsExportPrisma.$disconnect();
    await twseExportPrisma.$disconnect();
    await analysisPrisma.$disconnect();
  });
