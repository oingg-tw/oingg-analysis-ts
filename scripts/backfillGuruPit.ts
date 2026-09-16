// Point-in-time 架構第六批遷移（第三層：guru 分類 9 支重型多因子模型，共 9 個
// metric_code：grahamNumber/ncav/ownerEarnings/altmanZScore/piotroskiFScore/
// beneishMScore/nissimPenmanRnoa/zmijewskiScore/ohlsonOScore）的手動觸發 backfill——
// 不整合進 src/api/batch，純 CLI 腳本，殼子比照 scripts/backfillDebtAndValuationPit.ts。
//
// 用法：pnpm tsx scripts/backfillGuruPit.ts
// 符號/季度範圍沿用共用的 scripts/pitBackfillFixtures.ts。
import { computeAndWriteAltmanZScorePit, computeAndWriteBeneishMScorePit, computeAndWriteGrahamNumberPit, computeAndWriteNcavPit, computeAndWriteNissimPenmanRnoaPit, computeAndWriteOhlsonOScorePit, computeAndWriteOwnerEarningsPit, computeAndWritePiotroskiFScorePit, computeAndWriteZmijewskiScorePit } from '../src/bootstrap/pitMetrics';
import { upsertMetricDefinition, metricDefinitionRegistry } from '../src/application/metrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '../src/infrastructure/prisma/mopsExportClient';
import { analysisPrisma } from '../src/infrastructure/prisma/analysisClient';
import { PIT_BACKFILL_SYMBOLS, PIT_BACKFILL_QUARTERS } from './pitBackfillFixtures';

const METRIC_CODES = [
  'grahamNumber',
  'ncav',
  'ownerEarnings',
  'altmanZScore',
  'piotroskiFScore',
  'beneishMScore',
  'nissimPenmanRnoa',
  'zmijewskiScore',
  'ohlsonOScore',
];

const main = async () => {
  await Promise.all(METRIC_CODES.map((code) => upsertMetricDefinition(metricDefinitionRegistry[code]!)));

  for (const symbol of PIT_BACKFILL_SYMBOLS) {
    for (const { year, season } of PIT_BACKFILL_QUARTERS) {
      const query = { symbol, year, season, dataType: '2' as const, subsidiaryCompanyId: '' };

      const grahamNumberOutcome = await computeAndWriteGrahamNumberPit(query);
      console.log(`[graham-number-pit] ${symbol} ${year}Q${season}: TTM=${JSON.stringify(grahamNumberOutcome.ttm)}`);

      const ncavOutcome = await computeAndWriteNcavPit(query);
      console.log(`[ncav-pit] ${symbol} ${year}Q${season}: Q=${JSON.stringify(ncavOutcome.q)}`);

      const ownerEarningsOutcome = await computeAndWriteOwnerEarningsPit(query);
      console.log(
        `[owner-earnings-pit] ${symbol} ${year}Q${season}: Q=${JSON.stringify(ownerEarningsOutcome.q)} TTM=${JSON.stringify(ownerEarningsOutcome.ttm)}`
      );

      const altmanZScoreOutcome = await computeAndWriteAltmanZScorePit(query);
      console.log(`[altman-z-score-pit] ${symbol} ${year}Q${season}: TTM=${JSON.stringify(altmanZScoreOutcome.ttm)}`);

      const piotroskiFScoreOutcome = await computeAndWritePiotroskiFScorePit(query);
      console.log(`[piotroski-f-score-pit] ${symbol} ${year}Q${season}: Q=${JSON.stringify(piotroskiFScoreOutcome.q)}`);

      const beneishMScoreOutcome = await computeAndWriteBeneishMScorePit(query);
      console.log(`[beneish-m-score-pit] ${symbol} ${year}Q${season}: Q=${JSON.stringify(beneishMScoreOutcome.q)}`);

      const nissimPenmanRnoaOutcome = await computeAndWriteNissimPenmanRnoaPit(query);
      console.log(`[nissim-penman-rnoa-pit] ${symbol} ${year}Q${season}: Q=${JSON.stringify(nissimPenmanRnoaOutcome.q)} TTM=${JSON.stringify(nissimPenmanRnoaOutcome.ttm)}`);

      const zmijewskiScoreOutcome = await computeAndWriteZmijewskiScorePit(query);
      console.log(`[zmijewski-score-pit] ${symbol} ${year}Q${season}: TTM=${JSON.stringify(zmijewskiScoreOutcome.ttm)}`);

      const ohlsonOScoreOutcome = await computeAndWriteOhlsonOScorePit(query);
      console.log(`[ohlson-o-score-pit] ${symbol} ${year}Q${season}: TTM=${JSON.stringify(ohlsonOScoreOutcome.ttm)}`);
    }
  }
};

main()
  .catch((error) => {
    console.error('第六批遷移 backfill 腳本執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mopsExportPrisma.$disconnect();
    await analysisPrisma.$disconnect();
  });
