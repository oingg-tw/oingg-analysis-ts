// 2026-09-11：Joel Greenblatt「神奇公式」(Magic Formula) 的兩個組成指標，只回補 2330
// 最新一筆驗證。注意：這裡只做「盈餘收益率」跟「資本報酬率」這兩個可以算出單一公司數字
// 的組成指標，神奇公式本身「全市場排名相加取最低分」是橫截面排名方法論，不是單一公司的
// point-in-time 數字，這個服務的架構不支援，不在這次範圍內。
//
// 用法：pnpm tsx scripts/backfillGreenblattMagicFormulaPit.ts

import { computeAndWriteGreenblattEarningsYieldPit } from '../src/domainPitMetrics/valuation/greenblattEarningsYield/computeGreenblattEarningsYieldPit';
import { computeAndWriteGreenblattRocPit } from '../src/domainPitMetrics/profitability/greenblattRoc/computeGreenblattRocPit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '../src/domainPitMetrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '../src/adapters/prisma/mopsExportClient';
import { twseExportPrisma } from '../src/adapters/prisma/twseExportClient';
import { analysisPrisma } from '../src/adapters/prisma/analysisClient';

const SYMBOLS = ['2330'];

const main = async () => {
  await Promise.all(['greenblattEarningsYield', 'greenblattRoc'].map((code) => upsertMetricDefinition(metricDefinitionRegistry[code]!)));

  for (const symbol of SYMBOLS) {
    const query = { symbol, dataType: '2' as const, subsidiaryCompanyId: '' };
    console.log(`[greenblatt-earnings-yield-pit] ${symbol}: ${JSON.stringify(await computeAndWriteGreenblattEarningsYieldPit(query))}`);
    console.log(`[greenblatt-roc-pit] ${symbol}: ${JSON.stringify(await computeAndWriteGreenblattRocPit(query))}`);
  }
};

main()
  .catch((error) => {
    console.error('Greenblatt Magic Formula backfill 腳本執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mopsExportPrisma.$disconnect();
    await twseExportPrisma.$disconnect();
    await analysisPrisma.$disconnect();
  });
