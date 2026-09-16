// 2026-09-09 使用者要求「連續配息年數」先做邏輯、資料不用全面——只回補 2330 最新一筆
// （不像 peRatio/pbRatio 那種季度序列，這是 FY 週期的概念，一次查詢就是「以目前最新可用
// 季度為準，往回數的連續配息年數」，不需要逐季回補歷史）。
//
// 用法：pnpm tsx scripts/backfillConsecutiveDividendYearsPit.ts

import { computeAndWriteConsecutiveDividendYearsPit } from '../src/domainPitMetrics/dividend/consecutiveDividendYears/computeConsecutiveDividendYearsPit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '../src/domainPitMetrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '../src/infrastructure/prisma/mopsExportClient';
import { analysisPrisma } from '../src/infrastructure/prisma/analysisClient';

const SYMBOLS = ['2330'];

const main = async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.consecutiveDividendYears!);

  for (const symbol of SYMBOLS) {
    const query = { symbol, dataType: '2' as const, subsidiaryCompanyId: '' };
    const outcome = await computeAndWriteConsecutiveDividendYearsPit(query);
    console.log(`[consecutive-dividend-years-pit] ${symbol}: ${JSON.stringify(outcome)}`);
  }
};

main()
  .catch((error) => {
    console.error('consecutiveDividendYears backfill 腳本執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mopsExportPrisma.$disconnect();
    await analysisPrisma.$disconnect();
  });
