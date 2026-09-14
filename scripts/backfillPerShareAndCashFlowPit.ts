// Point-in-time 架構第三批遷移（profitability/cashFlow 簡單型 9 支舊架構檔案，共 10 個
// metric_code：eps/bvps/revenuePerShare/dividendPayoutRatio/sgr/ocfPerShare/fcfPerShare/
// ocfToNetIncome/accrualsRatio/fcfYield）的手動觸發 backfill——不整合進 src/api/batch，
// 純 CLI 腳本，殼子比照 scripts/backfillRoePit.ts（跑完斷線）。
//
// 用法：pnpm tsx scripts/backfillPerShareAndCashFlowPit.ts
// 符號/季度範圍沿用共用的 scripts/pitBackfillFixtures.ts（跟前兩批 backfill 腳本同一組）。

import { computeAndWriteEpsPit } from '../src/domainPitMetrics/profitability/eps/computeEpsPit';
import { computeAndWriteBvpsPit } from '../src/domainPitMetrics/valuation/bvps/computeBvpsPit';
import { computeAndWriteRevenuePerSharePit } from '../src/domainPitMetrics/profitability/revenuePerShare/computeRevenuePerSharePit';
import { computeAndWriteDividendPayoutRatioPit } from '../src/domainPitMetrics/dividend/dividendPayoutRatio/computeDividendPayoutRatioPit';
import { computeAndWriteSgrPit } from '../src/domainPitMetrics/growth/sgr/computeSgrPit';
import { computeAndWriteCashFlowPerSharePit } from '../src/domainPitMetrics/quality/cashFlowPerShare/computeCashFlowPerSharePit';
import { computeAndWriteOcfToNetIncomePit } from '../src/domainPitMetrics/quality/ocfToNetIncome/computeOcfToNetIncomePit';
import { computeAndWriteAccrualsRatioPit } from '../src/domainPitMetrics/quality/accrualsRatio/computeAccrualsRatioPit';
import { computeAndWriteFcfYieldPit } from '../src/domainPitMetrics/valuation/fcfYield/computeFcfYieldPit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '../src/domainPitMetrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '../src/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '../src/adapters/prisma/analysisClient';
import { PIT_BACKFILL_SYMBOLS, PIT_BACKFILL_QUARTERS } from './pitBackfillFixtures';

const main = async () => {
  await Promise.all(
    ['eps', 'bvps', 'revenuePerShare', 'dividendPayoutRatio', 'sgr', 'ocfPerShare', 'fcfPerShare', 'ocfToNetIncome', 'accrualsRatio', 'fcfYield'].map((code) =>
      upsertMetricDefinition(metricDefinitionRegistry[code]!)
    )
  );

  for (const symbol of PIT_BACKFILL_SYMBOLS) {
    for (const { year, season } of PIT_BACKFILL_QUARTERS) {
      const query = { symbol, year, season, dataType: '2' as const, subsidiaryCompanyId: '' };

      const epsOutcome = await computeAndWriteEpsPit(query);
      console.log(`[eps-pit] ${symbol} ${year}Q${season}: q=${JSON.stringify(epsOutcome.q)} qAnn=${JSON.stringify(epsOutcome.qAnn)} ttm=${JSON.stringify(epsOutcome.ttm)}`);

      const bvpsOutcome = await computeAndWriteBvpsPit(query);
      console.log(`[bvps-pit] ${symbol} ${year}Q${season}: q=${JSON.stringify(bvpsOutcome.q)}`);

      const revenuePerShareOutcome = await computeAndWriteRevenuePerSharePit(query);
      console.log(
        `[revenue-per-share-pit] ${symbol} ${year}Q${season}: q=${JSON.stringify(revenuePerShareOutcome.q)} qAnn=${JSON.stringify(revenuePerShareOutcome.qAnn)} ttm=${JSON.stringify(revenuePerShareOutcome.ttm)}`
      );

      const dividendPayoutRatioOutcome = await computeAndWriteDividendPayoutRatioPit(query);
      console.log(`[dividend-payout-ratio-pit] ${symbol} ${year}Q${season}: ttm=${JSON.stringify(dividendPayoutRatioOutcome.ttm)}`);

      const sgrOutcome = await computeAndWriteSgrPit(query);
      console.log(`[sgr-pit] ${symbol} ${year}Q${season}: ttm=${JSON.stringify(sgrOutcome.ttm)}`);

      const cashFlowPerShareOutcome = await computeAndWriteCashFlowPerSharePit(query);
      console.log(
        `[cash-flow-per-share-pit] ${symbol} ${year}Q${season}: ` +
          `ocf(Q=${JSON.stringify(cashFlowPerShareOutcome.ocfPerShareQ)}, TTM=${JSON.stringify(cashFlowPerShareOutcome.ocfPerShareTtm)}) ` +
          `fcf(Q=${JSON.stringify(cashFlowPerShareOutcome.fcfPerShareQ)}, TTM=${JSON.stringify(cashFlowPerShareOutcome.fcfPerShareTtm)})`
      );

      const ocfToNetIncomeOutcome = await computeAndWriteOcfToNetIncomePit(query);
      console.log(`[ocf-to-net-income-pit] ${symbol} ${year}Q${season}: q=${JSON.stringify(ocfToNetIncomeOutcome.q)} ttm=${JSON.stringify(ocfToNetIncomeOutcome.ttm)}`);

      const accrualsRatioOutcome = await computeAndWriteAccrualsRatioPit(query);
      console.log(
        `[accruals-ratio-pit] ${symbol} ${year}Q${season}: q=${JSON.stringify(accrualsRatioOutcome.q)} qAnn=${JSON.stringify(accrualsRatioOutcome.qAnn)} ttm=${JSON.stringify(accrualsRatioOutcome.ttm)}`
      );

      const fcfYieldOutcome = await computeAndWriteFcfYieldPit(query);
      console.log(`[fcf-yield-pit] ${symbol} ${year}Q${season}: qAnn=${JSON.stringify(fcfYieldOutcome.qAnn)} ttm=${JSON.stringify(fcfYieldOutcome.ttm)}`);
    }
  }
};

main()
  .catch((error) => {
    console.error('第三批遷移 backfill 腳本執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mopsExportPrisma.$disconnect();
    await analysisPrisma.$disconnect();
  });
