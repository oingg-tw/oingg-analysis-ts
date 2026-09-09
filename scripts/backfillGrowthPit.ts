// 2026-09-09 使用者要求：growth 分類加 5 支年增率指標（營收/EPS/淨利/營業利益/淨值），
// 資料不用全面，先做邏輯——只回補 2330 最新一筆驗證。
//
// 用法：pnpm tsx scripts/backfillGrowthPit.ts

import { computeAndWriteRevenueGrowthRatePit } from '../src/domainPitMetrics/growth/revenueGrowthRate/computeRevenueGrowthRatePit';
import { computeAndWriteEpsGrowthRatePit } from '../src/domainPitMetrics/growth/epsGrowthRate/computeEpsGrowthRatePit';
import { computeAndWriteNetIncomeGrowthRatePit } from '../src/domainPitMetrics/growth/netIncomeGrowthRate/computeNetIncomeGrowthRatePit';
import { computeAndWriteOperatingIncomeGrowthRatePit } from '../src/domainPitMetrics/growth/operatingIncomeGrowthRate/computeOperatingIncomeGrowthRatePit';
import { computeAndWriteEquityGrowthRatePit } from '../src/domainPitMetrics/growth/equityGrowthRate/computeEquityGrowthRatePit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '../src/domainPitMetrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '../src/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '../src/adapters/prisma/analysisClient';

const SYMBOLS = ['2330'];

const main = async () => {
  await Promise.all(
    ['revenueGrowthRate', 'epsGrowthRate', 'netIncomeGrowthRate', 'operatingIncomeGrowthRate', 'equityGrowthRate'].map((code) =>
      upsertMetricDefinition(metricDefinitionRegistry[code]!)
    )
  );

  for (const symbol of SYMBOLS) {
    const query = { symbol, dataType: '2' as const, subsidiaryCompanyId: '' };

    console.log(`[revenue-growth-rate-pit] ${symbol}: ${JSON.stringify(await computeAndWriteRevenueGrowthRatePit(query))}`);
    console.log(`[eps-growth-rate-pit] ${symbol}: ${JSON.stringify(await computeAndWriteEpsGrowthRatePit(query))}`);
    console.log(`[net-income-growth-rate-pit] ${symbol}: ${JSON.stringify(await computeAndWriteNetIncomeGrowthRatePit(query))}`);
    console.log(`[operating-income-growth-rate-pit] ${symbol}: ${JSON.stringify(await computeAndWriteOperatingIncomeGrowthRatePit(query))}`);
    console.log(`[equity-growth-rate-pit] ${symbol}: ${JSON.stringify(await computeAndWriteEquityGrowthRatePit(query))}`);
  }
};

main()
  .catch((error) => {
    console.error('growth 五支指標 backfill 腳本執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mopsExportPrisma.$disconnect();
    await analysisPrisma.$disconnect();
  });
