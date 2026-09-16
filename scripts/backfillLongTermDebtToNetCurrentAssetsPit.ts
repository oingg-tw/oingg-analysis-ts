// 2026-09-15：longTermDebtToNetCurrentAssets 上線後的全市場首次回填，單一指標，不用跑
// backfillAllMetricsLatestFullMarketPit.ts 整套 ~90 支指標那麼重。跟該腳本同一份全市場
// 清單標準（115Q2 dataType='2' 有 XBRL 合併報表資料的公司），同一種固定併發池寫法
// （SYMBOL_CONCURRENCY=8，避免打爆 Neon DB 連線數）。
//
// 用法：pnpm tsx scripts/backfillLongTermDebtToNetCurrentAssetsPit.ts
import { computeAndWriteLongTermDebtToNetCurrentAssetsPit } from '../src/bootstrap/pitMetrics';
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
  await upsertMetricDefinition(metricDefinitionRegistry.longTermDebtToNetCurrentAssets!);

  const symbols = await getFullMarketSymbols();
  console.log(`[long-term-debt-pit] 共 ${symbols.length} 家，併發數 ${SYMBOL_CONCURRENCY}`);

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
        const outcome = await computeAndWriteLongTermDebtToNetCurrentAssetsPit({ symbol, dataType: '2', subsidiaryCompanyId: '' });
        const action = outcome.q?.action ?? 'missing_q';
        actionCounts[action] = (actionCounts[action] ?? 0) + 1;
      } catch (error) {
        errors.push({ symbol, message: error instanceof Error ? error.message : String(error) });
        console.error(`[long-term-debt-pit] ${symbol} 失敗：`, error);
      }
      done += 1;

      if (done % PROGRESS_EVERY === 0 || done === symbols.length) {
        const elapsedMs = Date.now() - t0;
        const avgMsPerSymbol = elapsedMs / done;
        const remaining = symbols.length - done;
        const etaMs = avgMsPerSymbol * remaining;
        console.log(
          `[long-term-debt-pit] 進度 ${done}/${symbols.length}（${((done / symbols.length) * 100).toFixed(1)}%）` +
            ` 已耗時 ${(elapsedMs / 60000).toFixed(1)} 分鐘，預估剩餘 ${(etaMs / 60000).toFixed(1)} 分鐘，錯誤 ${errors.length} 筆`
        );
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(SYMBOL_CONCURRENCY, symbols.length) }, () => worker()));

  console.log(`[long-term-debt-pit] 完成，共 ${symbols.length} 家，總耗時 ${((Date.now() - t0) / 60000).toFixed(1)} 分鐘`);
  console.log('[long-term-debt-pit] action 統計：', actionCounts);
  if (errors.length > 0) {
    console.log(`[long-term-debt-pit] 錯誤 ${errors.length} 筆：`, errors.map((e) => e.symbol).join(','));
  }
};

main()
  .catch((error) => {
    console.error('[long-term-debt-pit] 執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectAllDbs();
  });
