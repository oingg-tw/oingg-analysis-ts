// 2026-09-15：dividendDistributionCount 上線後的首次回填，單一指標，不用跑
// backfillAllMetricsLatestFullMarketPit.ts 整套。銀行清單/全市場清單邏輯都不適用——
// 直接用 export.dividend_distribution 自己有哪些 symbol 決定要算哪些公司（見
// getSymbolsWithDividendDistribution 的說明），覆蓋範圍會隨 mops-ts 陸續回補自然變多，
// 不用等他們全市場批次跑完才能先把有資料的公司算起來。
//
// 用法：pnpm tsx scripts/backfillDividendDistributionCountPit.ts

import { computeAndWriteDividendDistributionCountPit } from '../src/domainPitMetrics/dividend/dividendDistributionCount/computeDividendDistributionCountPit';
import { getSymbolsWithDividendDistribution } from '../src/models/mops/dividendDistribution';
import { upsertMetricDefinition, metricDefinitionRegistry } from '../src/domainPitMetrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '../src/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '../src/adapters/prisma/analysisClient';

const SYMBOL_CONCURRENCY = 8;

const main = async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.dividendDistributionCount!);

  const symbols = await getSymbolsWithDividendDistribution();
  console.log(`[dividend-distribution-count-pit] 共 ${symbols.length} 家有股利分派紀錄的公司，併發數 ${SYMBOL_CONCURRENCY}`);

  const t0 = Date.now();
  let done = 0;
  const errors: { symbol: string; message: string }[] = [];
  const actionCounts: Record<string, number> = {};

  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < symbols.length) {
      const symbol = symbols[cursor]!;
      cursor += 1;
      try {
        const outcome = await computeAndWriteDividendDistributionCountPit({ symbol, dataType: '2', subsidiaryCompanyId: '' });
        const action = outcome.ttm.action;
        actionCounts[action] = (actionCounts[action] ?? 0) + 1;
      } catch (error) {
        errors.push({ symbol, message: error instanceof Error ? error.message : String(error) });
        console.error(`[dividend-distribution-count-pit] ${symbol} 失敗：`, error);
      }
      done += 1;

      if (done % 50 === 0 || done === symbols.length) {
        const elapsedMs = Date.now() - t0;
        console.log(`[dividend-distribution-count-pit] 進度 ${done}/${symbols.length}（${((done / symbols.length) * 100).toFixed(1)}%），已耗時 ${(elapsedMs / 60000).toFixed(1)} 分鐘，錯誤 ${errors.length} 筆`);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(SYMBOL_CONCURRENCY, symbols.length) }, () => worker()));

  console.log(`[dividend-distribution-count-pit] 完成，共 ${symbols.length} 家，總耗時 ${((Date.now() - t0) / 60000).toFixed(1)} 分鐘`);
  console.log('[dividend-distribution-count-pit] action 統計：', actionCounts);
  if (errors.length > 0) {
    console.log(`[dividend-distribution-count-pit] 錯誤 ${errors.length} 筆：`, errors.map((e) => e.symbol).join(','));
  }
};

main()
  .catch((error) => {
    console.error('[dividend-distribution-count-pit] 執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.all([mopsExportPrisma.$disconnect(), analysisPrisma.$disconnect()]);
  });
