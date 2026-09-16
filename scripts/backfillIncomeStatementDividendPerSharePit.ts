// 2026-09-15：grossProfitPerShare/operatingIncomePerShare/dividendPerShare 上線後的
// 全市場首次回填。單一腳本涵蓋三支指標（同一份全市場清單），仿照
// backfillWaterfallPerSharePit.ts 的併發池寫法。
//
// 用法：pnpm tsx scripts/backfillIncomeStatementDividendPerSharePit.ts
import { computeAndWriteDividendPerSharePit, computeAndWriteIncomeStatementPerSharePit } from '../src/bootstrap/pitMetrics';
import { metricDefinitionRegistry, upsertMetricDefinition } from '../src/bootstrap/metricDefinitions';
import { backfillUniverse } from '../src/bootstrap/scripts';
import { disconnectAllDbs } from '../src/bootstrap/db';

const PROGRESS_EVERY = 50;
const SYMBOL_CONCURRENCY = 8;

const getFullMarketSymbols = async (): Promise<string[]> => {
  const rows = await backfillUniverse.listSymbolsWithIncomeStatement('115', '2');
  return rows.map((r) => r.symbol);
};

const main = async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.grossProfitPerShare!);
  await upsertMetricDefinition(metricDefinitionRegistry.operatingIncomePerShare!);
  await upsertMetricDefinition(metricDefinitionRegistry.dividendPerShare!);

  const symbols = await getFullMarketSymbols();
  console.log(`[income-statement-dividend-per-share-pit] 共 ${symbols.length} 家，併發數 ${SYMBOL_CONCURRENCY}`);

  const t0 = Date.now();
  let done = 0;
  const errors: { symbol: string; message: string }[] = [];
  const grossActionCounts: Record<string, number> = {};
  const dividendActionCounts: Record<string, number> = {};

  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < symbols.length) {
      const symbol = symbols[cursor]!;
      cursor += 1;
      try {
        const query = { symbol, dataType: '2' as const, subsidiaryCompanyId: '' };
        const incomeOutcome = await computeAndWriteIncomeStatementPerSharePit(query);
        const dividendOutcome = await computeAndWriteDividendPerSharePit(query);
        const grossAction = incomeOutcome.grossProfitPerShareQ.action;
        const dividendAction = dividendOutcome.ttm.action;
        grossActionCounts[grossAction] = (grossActionCounts[grossAction] ?? 0) + 1;
        dividendActionCounts[dividendAction] = (dividendActionCounts[dividendAction] ?? 0) + 1;
      } catch (error) {
        errors.push({ symbol, message: error instanceof Error ? error.message : String(error) });
        console.error(`[income-statement-dividend-per-share-pit] ${symbol} 失敗：`, error);
      }
      done += 1;

      if (done % PROGRESS_EVERY === 0 || done === symbols.length) {
        const elapsedMs = Date.now() - t0;
        const avgMsPerSymbol = elapsedMs / done;
        const remaining = symbols.length - done;
        const etaMs = avgMsPerSymbol * remaining;
        console.log(
          `[income-statement-dividend-per-share-pit] 進度 ${done}/${symbols.length}（${((done / symbols.length) * 100).toFixed(1)}%）` +
            ` 已耗時 ${(elapsedMs / 60000).toFixed(1)} 分鐘，預估剩餘 ${(etaMs / 60000).toFixed(1)} 分鐘，錯誤 ${errors.length} 筆`
        );
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(SYMBOL_CONCURRENCY, symbols.length) }, () => worker()));

  console.log(`[income-statement-dividend-per-share-pit] 完成，共 ${symbols.length} 家，總耗時 ${((Date.now() - t0) / 60000).toFixed(1)} 分鐘`);
  console.log('[income-statement-dividend-per-share-pit] grossProfitPerShare action 統計：', grossActionCounts);
  console.log('[income-statement-dividend-per-share-pit] dividendPerShare action 統計：', dividendActionCounts);
  if (errors.length > 0) {
    console.log(`[income-statement-dividend-per-share-pit] 錯誤 ${errors.length} 筆：`, errors.map((e) => e.symbol).join(','));
  }
};

main()
  .catch((error) => {
    console.error('[income-statement-dividend-per-share-pit] 執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectAllDbs();
  });
