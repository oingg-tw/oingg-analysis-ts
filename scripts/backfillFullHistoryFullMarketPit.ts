// 2026-09-13 使用者拍板：把全部 60+ 支季報型指標從「全市場只有最新一季」擴到「全市場
// 全歷史」，起點 113Q1（發現原因是葛拉漢數字(grahamNumber)只回填了 113Q3~115Q2 三家
// 試點公司，2330 查 2023 年完全沒有資料——不是不適用也不是缺資料，是從來沒排進回填）。
//
// 歷史深度為什麼從 113Q1 開始，不是更早：財報 XBRL 資料本身在 113 年（2024）以前涵蓋
// 公司數就很稀疏（107-112 年多數季度只有個位數到數百家申報，是 mops-ts 來源端的限制，
// 不是我們能補的）——113Q1 起才有 1,000+ 家、資料量開始接近全市場規模，往前補只會
// 產生大量「查無資料」的空跑，統計意義有限。使用者確認採這個範圍。
//
// 逐日型指標（beta/exchangePeRatio/exchangePbRatio/dividendYield，來自 marketRatios/
// beta 這兩支 compute 函式）刻意不包含在這支腳本——那兩支沒有「這一季」的概念（內部
// 靠交易日快照解析），全市場歷史回填是完全不同的機制（要逐交易日回填，不是逐季），
// 見 project_beta_pit_pending.md 的既有決策（已結案：全市場回填暫緩），不要在這裡混著做。
//
// 每一季的全市場/銀行公司清單各自查那一季實際有 XBRL 資料的 symbol（不是固定用
// 115Q2 那份清單套用到全部季度）——113Q1 只有 1,102 家申報，115Q2 有 2,058 家，
// 用同一份清單會對還沒申報的公司做大量無意義空跑。
//
// 用法：
//   pnpm tsx scripts/backfillFullHistoryFullMarketPit.ts
//   PILOT_LIMIT=30 pnpm tsx scripts/backfillFullHistoryFullMarketPit.ts（單一季小批次測試）
//   PILOT_QUARTERS=1 pnpm tsx scripts/backfillFullHistoryFullMarketPit.ts（只跑最舊的 N 季）

import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { GENERAL_METRIC_CODES, BANK_METRIC_CODES, buildGeneralTasks, buildBankTasks, runTasks, type BackfillFailure } from './backfillTaskDefinitions';
import { upsertMetricDefinition, metricDefinitionRegistry } from '../src/domainPitMetrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '../src/adapters/prisma/mopsExportClient';
import { twseExportPrisma } from '../src/adapters/prisma/twseExportClient';
import { analysisPrisma } from '../src/adapters/prisma/analysisClient';
import type { Season } from '../src/shared/rocQuarter';

const PROGRESS_EVERY = 50;
const SYMBOL_CONCURRENCY = 8;

// 113Q1 ~ 115Q2，舊到新——舊到新的順序純粹是方便看進度／符合直覺，各指標彼此獨立計算
// 不依賴回填順序（每支 compute*Pit 都是自己重新查那一季的原始資料，不依賴 metric_values
// 裡已經寫入的其他季度值，見 grahamNumberDefinition.ts 等檔案「每支 PIT 檔案獨立、不互相
// 依賴」的既有原則）。
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

const getBankSymbolsForQuarter = async (year: string, season: Season): Promise<string[]> => {
  const rows = await mopsExportPrisma.$queryRaw<{ symbol: string }[]>`
    SELECT DISTINCT symbol FROM "export"."bank_capital_adequacy_detail_xbrl"
    WHERE year = ${year} AND quarter = ${season} AND eligible_capital IS NOT NULL
    ORDER BY symbol
  `;
  return rows.map((r) => r.symbol);
};

const writeFailuresFile = (slug: string, failures: BackfillFailure[]): void => {
  const dir = join(process.cwd(), 'tmp');
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, `backfill-failures-${slug}.json`);
  if (failures.length === 0) {
    if (existsSync(filePath)) rmSync(filePath);
    return;
  }
  writeFileSync(filePath, JSON.stringify(failures, null, 2));
  console.log(`[full-history-pit] 失敗清單已寫入 ${filePath}（${failures.length} 筆）`);
};

const runQuarterBatch = async (
  label: string,
  slug: string,
  symbols: string[],
  fn: (symbol: string) => Promise<{ failures: { label: string; error: unknown }[] }>
): Promise<BackfillFailure[]> => {
  console.log(`[full-history-pit] ${label}：共 ${symbols.length} 家，併發數 ${SYMBOL_CONCURRENCY}`);
  const t0 = Date.now();
  let done = 0;
  const errors: BackfillFailure[] = [];

  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < symbols.length) {
      const symbol = symbols[cursor]!;
      cursor += 1;
      try {
        const { failures } = await fn(symbol);
        for (const failure of failures) {
          const message = failure.error instanceof Error ? failure.error.message : String(failure.error);
          errors.push({ symbol, label: failure.label, message });
          console.error(`[full-history-pit] ${label} ${symbol} ${failure.label} 失敗：`, failure.error);
        }
      } catch (error) {
        errors.push({ symbol, label: '(whole-symbol)', message: error instanceof Error ? error.message : String(error) });
        console.error(`[full-history-pit] ${label} ${symbol} 失敗：`, error);
      }
      done += 1;

      if (done % PROGRESS_EVERY === 0 || done === symbols.length) {
        const elapsedMs = Date.now() - t0;
        const avgMsPerSymbol = elapsedMs / done;
        const remaining = symbols.length - done;
        const etaMs = avgMsPerSymbol * remaining;
        console.log(
          `[full-history-pit] ${label} 進度 ${done}/${symbols.length}（${((done / symbols.length) * 100).toFixed(1)}%）` +
            ` 已耗時 ${(elapsedMs / 60000).toFixed(1)} 分鐘，預估剩餘 ${(etaMs / 60000).toFixed(1)} 分鐘，錯誤 ${errors.length} 筆`
        );
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(SYMBOL_CONCURRENCY, symbols.length) }, () => worker()));

  console.log(`[full-history-pit] ${label} 完成，共 ${symbols.length} 家，錯誤 ${errors.length} 筆，總耗時 ${((Date.now() - t0) / 60000).toFixed(1)} 分鐘`);
  writeFailuresFile(slug, errors);
  return errors;
};

const main = async () => {
  await Promise.all(GENERAL_METRIC_CODES.map((code) => upsertMetricDefinition(metricDefinitionRegistry[code]!)));
  await Promise.all(BANK_METRIC_CODES.map((code) => upsertMetricDefinition(metricDefinitionRegistry[code]!)));

  const PILOT_LIMIT = process.env.PILOT_LIMIT ? Number(process.env.PILOT_LIMIT) : undefined;
  const PILOT_QUARTERS = process.env.PILOT_QUARTERS ? Number(process.env.PILOT_QUARTERS) : undefined;
  const quarters = PILOT_QUARTERS ? QUARTERS.slice(0, PILOT_QUARTERS) : QUARTERS;

  const allErrors: BackfillFailure[] = [];
  const t0 = Date.now();

  for (const { year, season } of quarters) {
    console.log(`\n[full-history-pit] ===== ${year}Q${season} 開始 =====`);
    const [generalSymbolsFull, bankSymbolsFull] = await Promise.all([getGeneralSymbolsForQuarter(year, season), getBankSymbolsForQuarter(year, season)]);
    const generalSymbols = PILOT_LIMIT ? generalSymbolsFull.slice(0, PILOT_LIMIT) : generalSymbolsFull;
    const bankSymbols = PILOT_LIMIT ? bankSymbolsFull.slice(0, Math.min(PILOT_LIMIT, bankSymbolsFull.length)) : bankSymbolsFull;

    const generalErrors = await runQuarterBatch(
      `${year}Q${season} 一般指標`,
      `general-${year}q${season}`,
      generalSymbols,
      (symbol) => runTasks(buildGeneralTasks(symbol, { year, season }))
    );
    const bankErrors = await runQuarterBatch(
      `${year}Q${season} 銀行監理指標`,
      `bank-${year}q${season}`,
      bankSymbols,
      (symbol) => runTasks(buildBankTasks(symbol, { year, season }))
    );
    allErrors.push(...generalErrors.map((e) => ({ ...e, label: `${year}Q${season}:${e.label}` })), ...bankErrors.map((e) => ({ ...e, label: `${year}Q${season}:${e.label}` })));
  }

  console.log(
    `\n[full-history-pit] 全部完成，共 ${quarters.length} 季，總錯誤 ${allErrors.length} 筆，總耗時 ${((Date.now() - t0) / 60000).toFixed(1)} 分鐘`
  );
  if (allErrors.length > 0) {
    writeFailuresFile('full-history-all', allErrors);
  }
};

main()
  .catch((error) => {
    console.error('全市場全歷史 backfill 腳本執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mopsExportPrisma.$disconnect();
    await twseExportPrisma.$disconnect();
    await analysisPrisma.$disconnect();
  });
