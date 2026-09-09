// 2026-09-09 使用者要求：股東政策分類再加三支指標（買回殖利率/股利保障倍數/股本變化率），
// 資料不用全面，先做邏輯——只回補 2330 最新一筆驗證。
//
// 用法：pnpm tsx scripts/backfillShareholderPolicyPit.ts

import { computeAndWriteBuybackYieldPit } from '../src/domainPitMetrics/dividend/buybackYield/computeBuybackYieldPit';
import { computeAndWriteDividendCoverageRatioPit } from '../src/domainPitMetrics/dividend/dividendCoverageRatio/computeDividendCoverageRatioPit';
import { computeAndWriteShareCountChangeRatePit } from '../src/domainPitMetrics/dividend/shareCountChangeRate/computeShareCountChangeRatePit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '../src/domainPitMetrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '../src/adapters/prisma/mopsExportClient';
import { twseExportPrisma } from '../src/adapters/prisma/twseExportClient';
import { analysisPrisma } from '../src/adapters/prisma/analysisClient';

const SYMBOLS = ['2330'];

const main = async () => {
  await Promise.all(
    ['buybackYield', 'dividendCoverageRatio', 'shareCountChangeRate'].map((code) => upsertMetricDefinition(metricDefinitionRegistry[code]!))
  );

  for (const symbol of SYMBOLS) {
    const query = { symbol, dataType: '2' as const, subsidiaryCompanyId: '' };

    const buybackOutcome = await computeAndWriteBuybackYieldPit(query);
    console.log(`[buyback-yield-pit] ${symbol}: ${JSON.stringify(buybackOutcome)}`);

    const coverageOutcome = await computeAndWriteDividendCoverageRatioPit(query);
    console.log(`[dividend-coverage-ratio-pit] ${symbol}: ${JSON.stringify(coverageOutcome)}`);

    const shareChangeOutcome = await computeAndWriteShareCountChangeRatePit(query);
    console.log(`[share-count-change-rate-pit] ${symbol}: ${JSON.stringify(shareChangeOutcome)}`);
  }
};

main()
  .catch((error) => {
    console.error('股東政策三支指標 backfill 腳本執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mopsExportPrisma.$disconnect();
    await twseExportPrisma.$disconnect();
    await analysisPrisma.$disconnect();
  });
