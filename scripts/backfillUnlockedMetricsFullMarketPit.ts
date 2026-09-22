// 「全市場六季財報深度解鎖的指標」批次——17 支新 metricCode 全市場回填。跟
// backfillMarketCapNcavGrahamNumberFullMarketPit.ts/
// backfillLiveValuationMetricsFullMarketPit.ts 同一個公司清單標準（115Q2 dataType='2'
// 有 XBRL 合併報表資料的公司，2,058 家），只算「最新一季」（各自 compute*Pit 函式在省略
// year/season 時都會自動解析最新可用季度）。
//
// 用法：pnpm tsx scripts/backfillUnlockedMetricsFullMarketPit.ts
//      PILOT_LIMIT=30 pnpm tsx scripts/backfillUnlockedMetricsFullMarketPit.ts（小批次測試）
import { computeAndWriteCashFlowValuationFamilyPit, computeAndWriteCashToAssetsRatioPit, computeAndWriteEquityRatioPit, computeAndWriteLeverageDegreeFamilyPit, computeAndWriteNonOperatingIncomeRatioPit, computeAndWriteTurnoverRatioFamilyPit } from '../src/bootstrap/pitMetrics';
import { metricDefinitionRegistry, upsertMetricDefinition } from '../src/bootstrap/metricDefinitions';
import { backfillUniverse, reportAvailability } from '../src/bootstrap/scripts';
import { disconnectAllDbs } from '../src/bootstrap/db';

const METRIC_CODES = [
  'evToOcf', 'evToSales', 'priceToOcf', 'debtToFcf', 'capexToOcfRatio', 'croic', 'ocfMargin', 'fcfConversionRate',
  'financialLeverageDegree', 'totalLeverageDegree', 'nonOperatingIncomeRatio', 'equityRatio', 'cashToAssetsRatio',
  'operatingCycle', 'netWorkingCapitalTurnover', 'inventoryToRevenueRatio', 'receivablesToRevenueRatio',
];

const PROGRESS_EVERY = 50;
const SYMBOL_CONCURRENCY = 8;

const getFullMarketSymbols = async (): Promise<string[]> => {
  const rows = await backfillUniverse.listSymbolsWithIncomeStatement('115', '2');
  return rows.map((r) => r.symbol);
};

// computeTurnoverRatioFamilyPit 本身也負責既有 4 個周轉率+3 個天數+CCC（已經全市場回填
// 過），這裡重跑它是為了順便補齊新加的 4 個 metricCode——同一支函式一次查詢全部一起寫，
// 不會重算出跟既有值不同的結果（純新增欄位，沒有改既有計算邏輯，見 tsc/oxlint/既有測試
// 驗證過的規格），重跑等同 no-op（既有欄位 skipped_unchanged）。
const computeSymbol = async (symbol: string): Promise<void> => {
  const query = { symbol, dataType: await reportAvailability.resolveDataType(symbol), subsidiaryCompanyId: '' };
  await Promise.all([
    computeAndWriteCashFlowValuationFamilyPit(query),
    computeAndWriteLeverageDegreeFamilyPit(query),
    computeAndWriteNonOperatingIncomeRatioPit(query),
    computeAndWriteEquityRatioPit(query),
    computeAndWriteCashToAssetsRatioPit(query),
    computeAndWriteTurnoverRatioFamilyPit(query),
  ]);
};

const main = async () => {
  await Promise.all(METRIC_CODES.map((code) => upsertMetricDefinition(metricDefinitionRegistry[code]!)));

  const symbolsFull = await getFullMarketSymbols();
  const PILOT_LIMIT = process.env.PILOT_LIMIT ? Number(process.env.PILOT_LIMIT) : undefined;
  const symbols = PILOT_LIMIT ? symbolsFull.slice(0, PILOT_LIMIT) : symbolsFull;
  console.log(`[unlocked-metrics-pit] 共 ${symbols.length} 家公司，開始跑 17 支新指標（各自最新一季），併發數 ${SYMBOL_CONCURRENCY}`);

  const t0 = Date.now();
  let done = 0;
  const errors: { symbol: string; error: unknown }[] = [];

  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < symbols.length) {
      const symbol = symbols[cursor]!;
      cursor += 1;
      try {
        await computeSymbol(symbol);
      } catch (error) {
        errors.push({ symbol, error });
        console.error(`[unlocked-metrics-pit] ${symbol} 失敗：`, error);
      }
      done += 1;

      if (done % PROGRESS_EVERY === 0 || done === symbols.length) {
        const elapsedMs = Date.now() - t0;
        const avgMsPerSymbol = elapsedMs / done;
        const remaining = symbols.length - done;
        const etaMs = avgMsPerSymbol * remaining;
        console.log(
          `[unlocked-metrics-pit] 進度 ${done}/${symbols.length}（${((done / symbols.length) * 100).toFixed(1)}%）` +
            ` 已耗時 ${(elapsedMs / 60000).toFixed(1)} 分鐘，預估剩餘 ${(etaMs / 60000).toFixed(1)} 分鐘，錯誤 ${errors.length} 筆`
        );
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(SYMBOL_CONCURRENCY, symbols.length) }, () => worker()));

  console.log(`[unlocked-metrics-pit] 完成，共 ${symbols.length} 家，錯誤 ${errors.length} 筆，總耗時 ${((Date.now() - t0) / 60000).toFixed(1)} 分鐘`);
  if (errors.length > 0) {
    console.log('[unlocked-metrics-pit] 錯誤清單：', errors.map((e) => e.symbol).join(','));
  }
};

main()
  .catch((error) => {
    console.error('「全市場六季財報深度解鎖的指標」批次回填腳本執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectAllDbs();
  });
