// 2026-09-15：depreciationAmortizationPerShare/pretaxIncomePerShare 上線後的全市場首次
// 回填，兩支都是應 web-nuxt「營收到股利去了哪裡」瀑布圖卡片需求新增的指標，一起回填。
// depreciationAmortizationPerShare 是併進既有 computeAndWriteCashFlowPerSharePit 的第三個
// metric_code（同一次查詢，會順便重算/重寫 ocfPerShare/fcfPerShare，冪等安全，不是問題）；
// pretaxIncomePerShare 是獨立的 computeAndWritePretaxIncomePerSharePit。跟
// backfillLongTermDebtToNetCurrentAssetsPit.ts 同一份全市場清單標準（115Q2 dataType='2'
// 有 XBRL 合併報表資料的公司）、同一種固定併發池寫法（SYMBOL_CONCURRENCY=8）。
//
// 用法：pnpm tsx scripts/backfillWaterfallPerSharePit.ts

import { computeAndWriteCashFlowPerSharePit } from '../src/application/metrics/quality/cashFlowPerShare/computeCashFlowPerSharePit';
import { computeAndWritePretaxIncomePerSharePit } from '../src/application/metrics/profitability/pretaxIncomePerShare/computePretaxIncomePerSharePit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '../src/application/metrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '../src/infrastructure/prisma/mopsExportClient';
import { twseExportPrisma } from '../src/infrastructure/prisma/twseExportClient';
import { analysisPrisma } from '../src/infrastructure/prisma/analysisClient';

const PROGRESS_EVERY = 50;
const SYMBOL_CONCURRENCY = 8;

const getFullMarketSymbols = async (): Promise<string[]> => {
  const rows = await mopsExportPrisma.$queryRaw<{ symbol: string }[]>`
    SELECT DISTINCT symbol FROM "export"."quarterly_income_statement_xbrl"
    WHERE year = '115' AND quarter = '2' AND data_type = '2'
    ORDER BY symbol
  `;
  return rows.map((r) => r.symbol);
};

const main = async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.depreciationAmortizationPerShare!);
  await upsertMetricDefinition(metricDefinitionRegistry.pretaxIncomePerShare!);

  const symbols = await getFullMarketSymbols();
  console.log(`[waterfall-per-share-pit] 共 ${symbols.length} 家，併發數 ${SYMBOL_CONCURRENCY}`);

  const t0 = Date.now();
  let done = 0;
  const errors: { symbol: string; message: string }[] = [];
  const daActionCounts: Record<string, number> = {};
  const pretaxActionCounts: Record<string, number> = {};

  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < symbols.length) {
      const symbol = symbols[cursor]!;
      cursor += 1;
      try {
        const query = { symbol, dataType: '2' as const, subsidiaryCompanyId: '' };
        const cashFlowOutcome = await computeAndWriteCashFlowPerSharePit(query);
        const pretaxOutcome = await computeAndWritePretaxIncomePerSharePit(query);
        const daAction = cashFlowOutcome.depreciationAmortizationPerShareQ.action;
        const pretaxAction = pretaxOutcome.q?.action ?? 'missing_q';
        daActionCounts[daAction] = (daActionCounts[daAction] ?? 0) + 1;
        pretaxActionCounts[pretaxAction] = (pretaxActionCounts[pretaxAction] ?? 0) + 1;
      } catch (error) {
        errors.push({ symbol, message: error instanceof Error ? error.message : String(error) });
        console.error(`[waterfall-per-share-pit] ${symbol} 失敗：`, error);
      }
      done += 1;

      if (done % PROGRESS_EVERY === 0 || done === symbols.length) {
        const elapsedMs = Date.now() - t0;
        const avgMsPerSymbol = elapsedMs / done;
        const remaining = symbols.length - done;
        const etaMs = avgMsPerSymbol * remaining;
        console.log(
          `[waterfall-per-share-pit] 進度 ${done}/${symbols.length}（${((done / symbols.length) * 100).toFixed(1)}%）` +
            ` 已耗時 ${(elapsedMs / 60000).toFixed(1)} 分鐘，預估剩餘 ${(etaMs / 60000).toFixed(1)} 分鐘，錯誤 ${errors.length} 筆`
        );
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(SYMBOL_CONCURRENCY, symbols.length) }, () => worker()));

  console.log(`[waterfall-per-share-pit] 完成，共 ${symbols.length} 家，總耗時 ${((Date.now() - t0) / 60000).toFixed(1)} 分鐘`);
  console.log('[waterfall-per-share-pit] depreciationAmortizationPerShare action 統計：', daActionCounts);
  console.log('[waterfall-per-share-pit] pretaxIncomePerShare action 統計：', pretaxActionCounts);
  if (errors.length > 0) {
    console.log(`[waterfall-per-share-pit] 錯誤 ${errors.length} 筆：`, errors.map((e) => e.symbol).join(','));
  }
};

main()
  .catch((error) => {
    console.error('[waterfall-per-share-pit] 執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.all([mopsExportPrisma.$disconnect(), twseExportPrisma.$disconnect(), analysisPrisma.$disconnect()]);
  });
