// 2026-09-13 稽核鏈驗證 buybackYield 時發現 computeBuybackYieldPit.ts 少做千元換元的
// x1000（分子千元直接除以分母的元，量綱不一致，實際數值被低估 1000 倍），已修正公式。
// 這支腳本只重跑 buybackYield 這一個 metricCode，全市場全歷史（113Q1~115Q2，跟
// backfillFullHistoryFullMarketPit.ts 同一個範圍），修正舊公式已寫入的錯誤值。
//
// 用法：pnpm tsx scripts/backfillBuybackYieldScaleFixPit.ts

import { computeAndWriteBuybackYieldPit } from '../src/domainPitMetrics/dividend/buybackYield/computeBuybackYieldPit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '../src/domainPitMetrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '../src/infrastructure/prisma/mopsExportClient';
import { twseExportPrisma } from '../src/infrastructure/prisma/twseExportClient';
import { analysisPrisma } from '../src/infrastructure/prisma/analysisClient';
import type { Season } from '../src/domain/calendar/rocQuarter';

const SYMBOL_CONCURRENCY = 8;
const PROGRESS_EVERY = 100;

const QUARTERS: { year: string; season: Season }[] = [
  { year: '113', season: '1' }, { year: '113', season: '2' }, { year: '113', season: '3' }, { year: '113', season: '4' },
  { year: '114', season: '1' }, { year: '114', season: '2' }, { year: '114', season: '3' }, { year: '114', season: '4' },
  { year: '115', season: '1' }, { year: '115', season: '2' },
];

const getGeneralSymbolsForQuarter = async (year: string, season: Season): Promise<string[]> => {
  const rows = await mopsExportPrisma.$queryRaw<{ symbol: string }[]>`
    SELECT DISTINCT symbol FROM "export"."quarterly_income_statement_xbrl"
    WHERE year = ${year} AND quarter = ${season} AND data_type = '2'
    ORDER BY symbol
  `;
  return rows.map((r) => r.symbol);
};

const main = async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.buybackYield!);

  let totalErrors = 0;
  const t0 = Date.now();

  for (const { year, season } of QUARTERS) {
    const symbols = await getGeneralSymbolsForQuarter(year, season);
    console.log(`\n[buyback-yield-fix] ${year}Q${season}：共 ${symbols.length} 家，併發數 ${SYMBOL_CONCURRENCY}`);

    let cursor = 0;
    let done = 0;
    let errors = 0;
    const qt0 = Date.now();

    const worker = async (): Promise<void> => {
      while (cursor < symbols.length) {
        const symbol = symbols[cursor]!;
        cursor += 1;
        try {
          await computeAndWriteBuybackYieldPit({ symbol, year, season, dataType: '2', subsidiaryCompanyId: '' });
        } catch (error) {
          errors += 1;
          totalErrors += 1;
          console.error(`[buyback-yield-fix] ${year}Q${season} ${symbol} 失敗：`, error);
        }
        done += 1;
        if (done % PROGRESS_EVERY === 0 || done === symbols.length) {
          console.log(`[buyback-yield-fix] ${year}Q${season} 進度 ${done}/${symbols.length}，已耗時 ${((Date.now() - qt0) / 60000).toFixed(1)} 分鐘，錯誤 ${errors} 筆`);
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(SYMBOL_CONCURRENCY, symbols.length) }, () => worker()));
    console.log(`[buyback-yield-fix] ${year}Q${season} 完成，錯誤 ${errors} 筆`);
  }

  console.log(`\n[buyback-yield-fix] 全部完成，總錯誤 ${totalErrors} 筆，總耗時 ${((Date.now() - t0) / 60000).toFixed(1)} 分鐘`);
};

main()
  .catch((error) => {
    console.error('buybackYield 量綱修正 backfill 腳本執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mopsExportPrisma.$disconnect();
    await twseExportPrisma.$disconnect();
    await analysisPrisma.$disconnect();
  });
