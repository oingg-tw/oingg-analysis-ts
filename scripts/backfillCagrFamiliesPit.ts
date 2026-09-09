// 2026-09-10 使用者要求：CAGR 系列（營收/EPS/股利）3/5/8 年都要做。只回補 2330 最新一筆
// 驗證——8 年窗口對 2330 目前的資料深度（約 6 年）預期會是 insufficient_history，這是
// 資料邊界不是 bug。
//
// 用法：pnpm tsx scripts/backfillCagrFamiliesPit.ts

import { computeAndWriteRevenueCagrFamilyPit } from '../src/domainPitMetrics/growth/revenueCagr/computeRevenueCagrFamilyPit';
import { computeAndWriteEpsCagrFamilyPit } from '../src/domainPitMetrics/growth/epsCagr/computeEpsCagrFamilyPit';
import { computeAndWriteDividendGrowthRateFamilyPit } from '../src/domainPitMetrics/dividend/dividendGrowthRate/computeDividendGrowthRateFamilyPit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '../src/domainPitMetrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '../src/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '../src/adapters/prisma/analysisClient';

const SYMBOLS = ['2330'];

const main = async () => {
  await Promise.all(
    ['revenueCagr3y', 'revenueCagr5y', 'revenueCagr8y', 'epsCagr3y', 'epsCagr5y', 'epsCagr8y', 'dividendGrowthRate3y', 'dividendGrowthRate5y', 'dividendGrowthRate8y'].map(
      (code) => upsertMetricDefinition(metricDefinitionRegistry[code]!)
    )
  );

  for (const symbol of SYMBOLS) {
    const query = { symbol, dataType: '2' as const, subsidiaryCompanyId: '' };
    console.log(`[revenue-cagr-family-pit] ${symbol}: ${JSON.stringify(await computeAndWriteRevenueCagrFamilyPit(query))}`);
    console.log(`[eps-cagr-family-pit] ${symbol}: ${JSON.stringify(await computeAndWriteEpsCagrFamilyPit(query))}`);
    console.log(`[dividend-growth-rate-family-pit] ${symbol}: ${JSON.stringify(await computeAndWriteDividendGrowthRateFamilyPit(query))}`);
  }
};

main()
  .catch((error) => {
    console.error('CAGR 系列 backfill 腳本執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mopsExportPrisma.$disconnect();
    await analysisPrisma.$disconnect();
  });
