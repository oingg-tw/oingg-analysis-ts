// liveGrahamNumber/livePegRatio/liveMarketCap 全市場回填——grahamNumber/pegRatio/marketCap
// 的即時版本（見各自 computeLive*Pit.ts 檔頭說明），基本面用最新已申報財報，股價用當下
// 最新收盤價，每個交易日更新。跟 backfillMarketCapNcavGrahamNumberFullMarketPit.ts 同一個
// 公司清單標準（115Q2 dataType='2' 有 XBRL 合併報表資料的公司，2,058 家）——只算「最新
// 一筆」（三支函式在省略 date 時都是直接查 getLatestDailyPrice，本來就沒有歷史多日的概念，
// 之後要更新只要重跑這支腳本，不需要額外參數）。
//
// 用法：pnpm tsx scripts/backfillLiveValuationMetricsFullMarketPit.ts

import { computeAndWriteLiveGrahamNumberPit } from '../src/domainPitMetrics/valuation/liveGrahamNumber/computeLiveGrahamNumberPit';
import { computeAndWriteLivePegRatioPit } from '../src/domainPitMetrics/valuation/livePegRatio/computeLivePegRatioPit';
import { computeAndWriteLiveMarketCapPit } from '../src/domainPitMetrics/valuation/liveMarketCap/computeLiveMarketCapPit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '../src/domainPitMetrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '../src/adapters/prisma/mopsExportClient';
import { twseExportPrisma } from '../src/adapters/prisma/twseExportClient';
import { analysisPrisma } from '../src/adapters/prisma/analysisClient';

const METRIC_CODES = ['liveGrahamNumber', 'livePegRatio', 'liveMarketCap'];
const PROGRESS_EVERY = 50;
const SYMBOL_CONCURRENCY = 8; // 同一套固定併發池，避免打爆 Neon DB 連線數，見 backfillAllMetricsLatestFullMarketPit.ts 的說明。

const getFullMarketSymbols = async (): Promise<string[]> => {
  const rows = await mopsExportPrisma.$queryRaw<{ symbol: string }[]>`
    SELECT DISTINCT symbol FROM "export"."quarterly_income_statement_xbrl"
    WHERE year = '115' AND quarter = '2' AND data_type = '2'
    ORDER BY symbol
  `;
  return rows.map((r) => r.symbol);
};

const computeSymbol = async (symbol: string): Promise<void> => {
  const query = { symbol, dataType: '2' as const, subsidiaryCompanyId: '' };
  await Promise.all([
    computeAndWriteLiveGrahamNumberPit(query),
    computeAndWriteLivePegRatioPit(query),
    computeAndWriteLiveMarketCapPit(query),
  ]);
};

const main = async () => {
  await Promise.all(METRIC_CODES.map((code) => upsertMetricDefinition(metricDefinitionRegistry[code]!)));

  const symbolsFull = await getFullMarketSymbols();
  const PILOT_LIMIT = process.env.PILOT_LIMIT ? Number(process.env.PILOT_LIMIT) : undefined;
  const symbols = PILOT_LIMIT ? symbolsFull.slice(0, PILOT_LIMIT) : symbolsFull;
  console.log(`[live-valuation-pit] 共 ${symbols.length} 家公司，開始跑 liveGrahamNumber/livePegRatio/liveMarketCap（各自最新一筆），併發數 ${SYMBOL_CONCURRENCY}`);

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
        console.error(`[live-valuation-pit] ${symbol} 失敗：`, error);
      }
      done += 1;

      if (done % PROGRESS_EVERY === 0 || done === symbols.length) {
        const elapsedMs = Date.now() - t0;
        const avgMsPerSymbol = elapsedMs / done;
        const remaining = symbols.length - done;
        const etaMs = avgMsPerSymbol * remaining;
        console.log(
          `[live-valuation-pit] 進度 ${done}/${symbols.length}（${((done / symbols.length) * 100).toFixed(1)}%）` +
            ` 已耗時 ${(elapsedMs / 60000).toFixed(1)} 分鐘，預估剩餘 ${(etaMs / 60000).toFixed(1)} 分鐘，錯誤 ${errors.length} 筆`
        );
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(SYMBOL_CONCURRENCY, symbols.length) }, () => worker()));

  console.log(`[live-valuation-pit] 完成，共 ${symbols.length} 家，錯誤 ${errors.length} 筆，總耗時 ${((Date.now() - t0) / 60000).toFixed(1)} 分鐘`);
  if (errors.length > 0) {
    console.log('[live-valuation-pit] 錯誤清單：', errors.map((e) => e.symbol).join(','));
  }
};

main()
  .catch((error) => {
    console.error('liveGrahamNumber/livePegRatio/liveMarketCap 全市場 backfill 腳本執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mopsExportPrisma.$disconnect();
    await twseExportPrisma.$disconnect();
    await analysisPrisma.$disconnect();
  });
