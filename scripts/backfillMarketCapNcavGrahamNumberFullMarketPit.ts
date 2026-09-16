// 2026-09-11：使用者要求把 marketCap/pegRatio/ncav/grahamNumber 這批（今天改動的估值
// 指標，之前只回填 2330 或 2317/2330/2887）擴大到全市場，只做「最新一季」（四支的
// compute*Pit 函式在 year/season 省略時都會自動解析最新可用季度，跟既有
// backfillMarketCapPit.ts/backfillPegRatioPit.ts 同一個呼叫慣例），不做歷史多季——
// 歷史範圍留給之後真的有需求時再擴大，這次範圍刻意限定在「今天改動的這 4 支指標的
// 最新快照」。
//
// 全市場清單直接查 quarterly_income_statement_xbrl 115Q2 dataType='2' 的 distinct
// symbol（mops-ts 剛完成全市場 XBRL backfill，2,349 家公司、這裡抓到 2,058 家有
// 115Q2 合併報表資料）——比對 export.company_profile（TWSE 1,398＋TPEx 1,255 家）更
// 精準，因為 company_profile 涵蓋所有掛牌公司（含 ETF/無財報義務的），這裡只要「真的
// 有財報可以算」的公司清單。
//
// 用法：pnpm tsx scripts/backfillMarketCapNcavGrahamNumberFullMarketPit.ts

import { computeAndWriteMarketCapPit } from '../src/application/metrics/valuation/marketCap/computeMarketCapPit';
import { computeAndWritePegRatioPit } from '../src/application/metrics/valuation/pegRatio/computePegRatioPit';
import { computeAndWriteNcavPit } from '../src/application/metrics/valuation/ncav/computeNcavPit';
import { computeAndWriteGrahamNumberPit } from '../src/application/metrics/valuation/grahamNumber/computeGrahamNumberPit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '../src/application/metrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '../src/infrastructure/prisma/mopsExportClient';
import { analysisPrisma } from '../src/infrastructure/prisma/analysisClient';

const PROGRESS_EVERY = 50;

const getFullMarketSymbols = async (): Promise<string[]> => {
  const rows = await mopsExportPrisma.$queryRaw<{ symbol: string }[]>`
    SELECT DISTINCT symbol FROM "export"."quarterly_income_statement_xbrl"
    WHERE year = '115' AND quarter = '2' AND data_type = '2'
    ORDER BY symbol
  `;
  return rows.map((r) => r.symbol);
};

const main = async () => {
  await Promise.all(['marketCap', 'pegRatio', 'ncav', 'grahamNumber'].map((code) => upsertMetricDefinition(metricDefinitionRegistry[code]!)));

  const symbols = await getFullMarketSymbols();
  console.log(`[full-market-pit] 共 ${symbols.length} 家公司，開始跑 marketCap/pegRatio/ncav/grahamNumber（各自最新一季）`);

  const t0 = Date.now();
  let done = 0;
  const errors: { symbol: string; error: unknown }[] = [];

  for (const symbol of symbols) {
    const query = { symbol, dataType: '2' as const, subsidiaryCompanyId: '' };
    try {
      await computeAndWriteMarketCapPit(query);
      await computeAndWritePegRatioPit(query);
      await computeAndWriteNcavPit(query);
      await computeAndWriteGrahamNumberPit(query);
    } catch (error) {
      errors.push({ symbol, error });
      console.error(`[full-market-pit] ${symbol} 失敗：`, error);
    }
    done += 1;

    if (done % PROGRESS_EVERY === 0 || done === symbols.length) {
      const elapsedMs = Date.now() - t0;
      const avgMsPerSymbol = elapsedMs / done;
      const remaining = symbols.length - done;
      const etaMs = avgMsPerSymbol * remaining;
      console.log(
        `[full-market-pit] 進度 ${done}/${symbols.length}（${((done / symbols.length) * 100).toFixed(1)}%）` +
          ` 已耗時 ${(elapsedMs / 60000).toFixed(1)} 分鐘，預估剩餘 ${(etaMs / 60000).toFixed(1)} 分鐘，錯誤 ${errors.length} 筆`
      );
    }
  }

  console.log(`[full-market-pit] 完成，共 ${symbols.length} 家，錯誤 ${errors.length} 筆，總耗時 ${((Date.now() - t0) / 60000).toFixed(1)} 分鐘`);
  if (errors.length > 0) {
    console.log('[full-market-pit] 錯誤清單：', errors.map((e) => e.symbol).join(','));
  }
};

main()
  .catch((error) => {
    console.error('marketCap/pegRatio/ncav/grahamNumber 全市場 backfill 腳本執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mopsExportPrisma.$disconnect();
    await analysisPrisma.$disconnect();
  });
