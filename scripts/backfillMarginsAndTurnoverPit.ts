// Point-in-time 架構第五批遷移（第二層：margins/turnoverRatio 補完整，共 10 個
// metric_code：grossMargin/operatingMargin/inventoryTurnover/receivablesTurnover/
// fixedAssetTurnover/payablesTurnover/inventoryDays/receivablesDays/payablesDays/
// cashConversionCycle）的手動觸發 backfill——不整合進 src/api/batch，純 CLI 腳本，
// 殼子比照 scripts/backfillRoePit.ts（跑完斷線）。
//
// 用法：pnpm tsx scripts/backfillMarginsAndTurnoverPit.ts
// 符號/季度範圍沿用共用的 scripts/pitBackfillFixtures.ts。

import { computeAndWriteMarginsFamilyPit } from '../src/application/metrics/profitability/margins/computeMarginsFamilyPit';
import { computeAndWriteTurnoverRatioFamilyPit } from '../src/application/metrics/efficiency/turnoverRatio/computeTurnoverRatioFamilyPit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '../src/application/metrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '../src/infrastructure/prisma/mopsExportClient';
import { analysisPrisma } from '../src/infrastructure/prisma/analysisClient';
import { PIT_BACKFILL_SYMBOLS, PIT_BACKFILL_QUARTERS } from './pitBackfillFixtures';

const METRIC_CODES = [
  'grossMargin',
  'operatingMargin',
  'inventoryTurnover',
  'receivablesTurnover',
  'fixedAssetTurnover',
  'payablesTurnover',
  'inventoryDays',
  'receivablesDays',
  'payablesDays',
  'cashConversionCycle',
];

const main = async () => {
  await Promise.all(METRIC_CODES.map((code) => upsertMetricDefinition(metricDefinitionRegistry[code]!)));

  for (const symbol of PIT_BACKFILL_SYMBOLS) {
    for (const { year, season } of PIT_BACKFILL_QUARTERS) {
      const query = { symbol, year, season, dataType: '2' as const, subsidiaryCompanyId: '' };

      const marginsOutcome = await computeAndWriteMarginsFamilyPit(query);
      console.log(
        `[margins-family-pit] ${symbol} ${year}Q${season}: gross(Q=${JSON.stringify(marginsOutcome.grossMarginQ)}, TTM=${JSON.stringify(marginsOutcome.grossMarginTtm)}) operating(Q=${JSON.stringify(marginsOutcome.operatingMarginQ)}, TTM=${JSON.stringify(marginsOutcome.operatingMarginTtm)})`
      );

      const turnoverOutcome = await computeAndWriteTurnoverRatioFamilyPit(query);
      console.log(
        `[turnover-ratio-family-pit] ${symbol} ${year}Q${season}: ` +
          `inventory(Q=${JSON.stringify(turnoverOutcome.inventoryTurnoverQ)}) receivables(Q=${JSON.stringify(turnoverOutcome.receivablesTurnoverQ)}) ` +
          `fixedAsset(Q=${JSON.stringify(turnoverOutcome.fixedAssetTurnoverQ)}) payables(Q=${JSON.stringify(turnoverOutcome.payablesTurnoverQ)}) ` +
          `ccc(TTM=${JSON.stringify(turnoverOutcome.cashConversionCycleTtm)})`
      );
    }
  }
};

main()
  .catch((error) => {
    console.error('第五批遷移 backfill 腳本執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mopsExportPrisma.$disconnect();
    await analysisPrisma.$disconnect();
  });
