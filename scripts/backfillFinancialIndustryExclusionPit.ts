// 2026-09-13 使用者拍板排入行程：Altman Z-Score/Z″-Score/Beneish M-Score/Ohlson O-Score/
// Zmijewski Score 這 5 個危機預警/操縱偵測模型，這學期加上金融保險業（industry='17'）排除
// 邏輯（見 src/models/securitiesIndustry.ts 的 isFinancialIndustryCompany 說明），
// 但只在開發時對 2891 等個案手動 spot check 過，全市場金融業公司的 DB 值還沒重算，
// nullReason 停留在舊的 insufficient_history/missing_input（見跟 oingg-web-nuxt-ef 的討論）。
//
// 不重跑 backfillAllMetricsLatestFullMarketPit.ts 全市場 61 支指標（2058 家 x 61 支太重，
// 而且非金融業公司的這 5 支指標邏輯沒變，重算也是拿一樣的值，純粹浪費時間）——這支腳本
// 用 listCompaniesBySectorCodes(['17']) 直接查金融保險業公司清單，只對這批公司重算這 5 支
// 受影響的指標。
//
// 用法：pnpm tsx scripts/backfillFinancialIndustryExclusionPit.ts
import { computeAndWriteAltmanZDoublePrimeScorePit, computeAndWriteAltmanZScorePit, computeAndWriteBeneishMScorePit, computeAndWriteOhlsonOScorePit, computeAndWriteZmijewskiScorePit } from '../src/bootstrap/pitMetrics';
import { upsertMetricDefinition, metricDefinitionRegistry } from '../src/application/metrics/metricDefinitionRegistry';
import { listCompaniesBySectorCodes } from '../src/infrastructure/repositories/exchange/securitiesIndustry';
import { mopsExportPrisma } from '../src/infrastructure/prisma/mopsExportClient';
import { twseExportPrisma } from '../src/infrastructure/prisma/twseExportClient';
import tpexExportPrisma from '../src/infrastructure/prisma/tpexExportClient';
import { analysisPrisma } from '../src/infrastructure/prisma/analysisClient';

const AFFECTED_METRIC_CODES = ['altmanZScore', 'altmanZDoublePrimeScore', 'beneishMScore', 'ohlsonOScore', 'zmijewskiScore'] as const;

const SYMBOL_CONCURRENCY = 8;

const computeSymbol = async (symbol: string): Promise<{ label: string; error: unknown }[]> => {
  const query = { symbol, dataType: '2' as const, subsidiaryCompanyId: '' };
  const tasks: [string, () => Promise<unknown>][] = [
    ['altmanZScore', () => computeAndWriteAltmanZScorePit(query)],
    ['altmanZDoublePrimeScore', () => computeAndWriteAltmanZDoublePrimeScorePit(query)],
    ['beneishMScore', () => computeAndWriteBeneishMScorePit(query)],
    ['ohlsonOScore', () => computeAndWriteOhlsonOScorePit(query)],
    ['zmijewskiScore', () => computeAndWriteZmijewskiScorePit(query)],
  ];
  const results = await Promise.allSettled(tasks.map(([, fn]) => fn()));
  return results.flatMap((r, i) => (r.status === 'rejected' ? [{ label: tasks[i]![0], error: r.reason }] : []));
};

const main = async () => {
  await Promise.all(AFFECTED_METRIC_CODES.map((code) => upsertMetricDefinition(metricDefinitionRegistry[code]!)));

  const symbols = [...(await listCompaniesBySectorCodes(['17']))].sort();
  console.log(`[financial-industry-exclusion-pit] 金融保險業（industry=17）共 ${symbols.length} 家，開始重算 ${AFFECTED_METRIC_CODES.join('/')}`);

  const t0 = Date.now();
  let done = 0;
  const errors: { symbol: string; label: string; error: unknown }[] = [];

  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < symbols.length) {
      const symbol = symbols[cursor]!;
      cursor += 1;
      const failures = await computeSymbol(symbol);
      for (const failure of failures) {
        errors.push({ symbol, ...failure });
        console.error(`[financial-industry-exclusion-pit] ${symbol} ${failure.label} 失敗：`, failure.error);
      }
      done += 1;
      console.log(`[financial-industry-exclusion-pit] 進度 ${done}/${symbols.length}（${symbol}）`);
    }
  };

  await Promise.all(Array.from({ length: Math.min(SYMBOL_CONCURRENCY, symbols.length) }, () => worker()));

  console.log(`[financial-industry-exclusion-pit] 完成，共 ${symbols.length} 家，錯誤 ${errors.length} 筆，耗時 ${((Date.now() - t0) / 1000).toFixed(1)} 秒`);
  if (errors.length > 0) {
    console.log(`[financial-industry-exclusion-pit] 失敗公司：`, [...new Set(errors.map((e) => e.symbol))].join(','));
  }
};

main()
  .catch((error) => {
    console.error('金融保險業排除邏輯 backfill 執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mopsExportPrisma.$disconnect();
    await twseExportPrisma.$disconnect();
    await tpexExportPrisma.$disconnect();
    await analysisPrisma.$disconnect();
  });
