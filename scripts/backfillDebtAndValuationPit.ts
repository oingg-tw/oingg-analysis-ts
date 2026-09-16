// Point-in-time 架構第四批遷移（resilience/turnover/valuation 簡單型 11 支舊架構檔案，
// 共 13 個 metric_code：debtRatio/currentRatio/quickRatio/cashRatio/deRatio/
// interestCoverage/netDebtToEbitda/capexToRevenue/psr/pFcf/evEbitda/roic/roce）的手動
// 觸發 backfill——不整合進 src/api/batch，純 CLI 腳本，殼子比照 scripts/backfillRoePit.ts
// （跑完斷線）。
//
// 用法：pnpm tsx scripts/backfillDebtAndValuationPit.ts
// 符號/季度範圍沿用共用的 scripts/pitBackfillFixtures.ts（跟前幾批 backfill 腳本同一組）。
import { computeAndWriteCapexToRevenuePit, computeAndWriteDebtRatioPit, computeAndWriteDeRatioPit, computeAndWriteEvEbitdaPit, computeAndWriteInterestCoveragePit, computeAndWriteLiquidityRatioPit, computeAndWriteNetDebtToEbitdaPit, computeAndWritePFcfPit, computeAndWritePsrPit, computeAndWriteRocePit, computeAndWriteRoicPit } from '../src/bootstrap/pitMetrics';
import { metricDefinitionRegistry, upsertMetricDefinition } from '../src/bootstrap/metricDefinitions';
import { PIT_BACKFILL_SYMBOLS, PIT_BACKFILL_QUARTERS } from './pitBackfillFixtures';
import { disconnectAllDbs } from '../src/bootstrap/db';

const main = async () => {
  await Promise.all(
    ['debtRatio', 'currentRatio', 'quickRatio', 'cashRatio', 'deRatio', 'interestCoverage', 'netDebtToEbitda', 'capexToRevenue', 'psr', 'pFcf', 'evEbitda', 'roic', 'roce'].map(
      (code) => upsertMetricDefinition(metricDefinitionRegistry[code]!)
    )
  );

  for (const symbol of PIT_BACKFILL_SYMBOLS) {
    for (const { year, season } of PIT_BACKFILL_QUARTERS) {
      const query = { symbol, year, season, dataType: '2' as const, subsidiaryCompanyId: '' };

      const debtRatioOutcome = await computeAndWriteDebtRatioPit(query);
      console.log(`[debt-ratio-pit] ${symbol} ${year}Q${season}: q=${JSON.stringify(debtRatioOutcome.q)}`);

      const liquidityRatioOutcome = await computeAndWriteLiquidityRatioPit(query);
      console.log(
        `[liquidity-ratio-pit] ${symbol} ${year}Q${season}: current=${JSON.stringify(liquidityRatioOutcome.currentRatio)} quick=${JSON.stringify(liquidityRatioOutcome.quickRatio)} cash=${JSON.stringify(liquidityRatioOutcome.cashRatio)}`
      );

      const deRatioOutcome = await computeAndWriteDeRatioPit(query);
      console.log(`[de-ratio-pit] ${symbol} ${year}Q${season}: q=${JSON.stringify(deRatioOutcome.q)}`);

      const interestCoverageOutcome = await computeAndWriteInterestCoveragePit(query);
      console.log(`[interest-coverage-pit] ${symbol} ${year}Q${season}: q=${JSON.stringify(interestCoverageOutcome.q)} ttm=${JSON.stringify(interestCoverageOutcome.ttm)}`);

      const netDebtToEbitdaOutcome = await computeAndWriteNetDebtToEbitdaPit(query);
      console.log(`[net-debt-to-ebitda-pit] ${symbol} ${year}Q${season}: ttm=${JSON.stringify(netDebtToEbitdaOutcome.ttm)}`);

      const capexToRevenueOutcome = await computeAndWriteCapexToRevenuePit(query);
      console.log(`[capex-to-revenue-pit] ${symbol} ${year}Q${season}: q=${JSON.stringify(capexToRevenueOutcome.q)} ttm=${JSON.stringify(capexToRevenueOutcome.ttm)}`);

      const psrOutcome = await computeAndWritePsrPit(query);
      console.log(`[psr-pit] ${symbol} ${year}Q${season}: ttm=${JSON.stringify(psrOutcome.ttm)}`);

      const pFcfOutcome = await computeAndWritePFcfPit(query);
      console.log(`[p-fcf-pit] ${symbol} ${year}Q${season}: ttm=${JSON.stringify(pFcfOutcome.ttm)}`);

      const evEbitdaOutcome = await computeAndWriteEvEbitdaPit(query);
      console.log(`[ev-ebitda-pit] ${symbol} ${year}Q${season}: ttm=${JSON.stringify(evEbitdaOutcome.ttm)}`);

      const roicOutcome = await computeAndWriteRoicPit(query);
      console.log(`[roic-pit] ${symbol} ${year}Q${season}: q=${JSON.stringify(roicOutcome.q)} ttm=${JSON.stringify(roicOutcome.ttm)}`);

      const roceOutcome = await computeAndWriteRocePit(query);
      console.log(`[roce-pit] ${symbol} ${year}Q${season}: q=${JSON.stringify(roceOutcome.q)} ttm=${JSON.stringify(roceOutcome.ttm)}`);
    }
  }
};

main()
  .catch((error) => {
    console.error('第四批遷移 backfill 腳本執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectAllDbs();
  });
