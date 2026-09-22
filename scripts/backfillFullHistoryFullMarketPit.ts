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
//   ONLY_QUARTERS=115Q1,115Q2 pnpm tsx scripts/backfillFullHistoryFullMarketPit.ts（只跑
//     指定的季度，其餘不查也不跳過提示——用在「已經確認某幾季真的跑完，只想繼續剩下
//     沒跑過的」，跟 PILOT_QUARTERS 只能取最舊 N 季不同）
//   FORCE_RESTART=1 pnpm tsx scripts/backfillFullHistoryFullMarketPit.ts（忽略續跑進度檔，
//     全部從頭重跑）
//
// 2026-09-13 使用者要求加上續跑機制，原本被中斷（手動 kill、機器重開）就要從 113Q1
// 整個重跑，已經跑完的部分（可能好幾個小時）全部浪費掉。續跑粒度是「單一公司」不是
// 整季——每支 compute*Pit 都是獨立 upsert（不依賴同季其他公司或其他 metricCode 是否
// 已寫入），逐家記錄「這家公司這一季（一般/銀行）已經處理過」不需要額外追蹤細節，
// 複雜度並不比整季高，卻能把中斷造成的損失從「最多一整季（40~110 分鐘）」壓到
// 「最多 FLUSH_EVERY 家（幾十秒）」。進度檔（tmp/full-history-backfill-progress.json）
// 記錄「(季度, 一般/銀行) → 已處理過的 symbol 清單」，每處理 FLUSH_EVERY 家或該批次
// 跑完就落盤一次，不是每家都寫檔（避免 I/O 太頻繁）。「已處理過」不代表「零錯誤」——
// 失敗的公司會記錄進 tmp/backfill-failures-*.json，那個檔案本來就是重跑失敗清單用的
// （retryBackfillFailuresPit.ts），續跑機制不重複做這件事，只避免重跑「已經成功寫入」
// 的部分。

import { mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GENERAL_METRIC_CODES, BANK_METRIC_CODES, buildGeneralTasks, buildBankTasks, runTasks, type BackfillFailure } from './backfillTaskDefinitions';
import { metricDefinitionRegistry, upsertMetricDefinition } from '../src/bootstrap/metricDefinitions';
import type { Season } from '../src/domain/calendar/rocQuarter';
import { backfillUniverse } from '../src/bootstrap/scripts';
import { disconnectAllDbs } from '../src/bootstrap/db';
import { memoizeStatementsForBackfill } from '../src/bootstrap/memoizedStatements';

const PROGRESS_EVERY = 50;
const SYMBOL_CONCURRENCY = 8;
const FLUSH_EVERY = 20;

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
  const rows = await backfillUniverse.listSymbolsWithIncomeStatement(year, season);
  return rows.map((r) => r.symbol);
};

const getBankSymbolsForQuarter = async (year: string, season: Season): Promise<string[]> => {
  const rows = await backfillUniverse.listBankSymbolsForQuarter(year, season);
  return rows.map((r) => r.symbol);
};

// 進度檔形狀：{ "113Q1:general": ["1101","1102",...], "113Q1:bank": [...], ... }——
// key 是「季度:一般或銀行」，value 是這個批次裡已經處理過（不論成功或失敗，見檔頭
// 說明）的 symbol 清單。用扁平的 key 而不是巢狀物件，單純是讀寫比較直接。
const PROGRESS_FILE_PATH = join(process.cwd(), 'tmp', 'full-history-backfill-progress.json');

const batchKey = (year: string, season: Season, kind: 'general' | 'bank'): string => `${year}Q${season}:${kind}`;

type ProgressMap = Map<string, Set<string>>;

const loadProgress = (): ProgressMap => {
  if (process.env.FORCE_RESTART === '1') return new Map();
  if (!existsSync(PROGRESS_FILE_PATH)) return new Map();
  try {
    const raw = JSON.parse(readFileSync(PROGRESS_FILE_PATH, 'utf-8')) as Record<string, string[]>;
    return new Map(Object.entries(raw).map(([key, symbols]) => [key, new Set(symbols)]));
  } catch {
    // 進度檔損壞或格式不對——保守起見視為沒有進度，不要讓一個壞掉的檔案擋住整支腳本執行。
    return new Map();
  }
};

const saveProgress = (progress: ProgressMap): void => {
  mkdirSync(join(process.cwd(), 'tmp'), { recursive: true });
  const serializable = Object.fromEntries(Array.from(progress.entries()).map(([key, symbols]) => [key, Array.from(symbols)]));
  writeFileSync(PROGRESS_FILE_PATH, JSON.stringify(serializable, null, 2));
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

// ETA 用最近 ROLLING_WINDOW 筆完成時間算「目前」速度，不是從頭到現在的累積平均——
// 累積平均會被跑最快的前段資料拖著跑，季度中後段如果變慢（連線池競爭、資料量變大等），
// 累積平均要很久才會反應出來，滾動視窗能立刻反映目前實際速度。使用者發現這個問題後
// 要求修正。
const ROLLING_WINDOW = 30;

const runQuarterBatch = async (
  label: string,
  slug: string,
  allSymbols: string[],
  alreadyDone: Set<string>,
  progress: ProgressMap,
  progressKey: string,
  fn: (symbol: string) => Promise<{ failures: { label: string; error: unknown }[] }>
): Promise<BackfillFailure[]> => {
  const pending = allSymbols.filter((s) => !alreadyDone.has(s));
  const skipped = allSymbols.length - pending.length;
  if (skipped > 0) {
    console.log(`[full-history-pit] ${label}：續跑進度檔已標記 ${skipped}/${allSymbols.length} 家完成，跳過`);
  }
  console.log(`[full-history-pit] ${label}：共 ${allSymbols.length} 家（待處理 ${pending.length} 家），併發數 ${SYMBOL_CONCURRENCY}`);

  if (pending.length === 0) return [];

  const t0 = Date.now();
  let done = 0;
  let sinceLastFlush = 0;
  const errors: BackfillFailure[] = [];
  const recentCompletionTimes: number[] = [];

  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < pending.length) {
      const symbol = pending[cursor]!;
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

      // 不論成功或失敗都標記「處理過」——失敗的公司走既有的 retryBackfillFailuresPit.ts
      // 補（見檔頭說明），續跑機制的職責只是不要重跑已經處理過的部分。
      alreadyDone.add(symbol);
      done += 1;
      sinceLastFlush += 1;
      recentCompletionTimes.push(Date.now());
      if (recentCompletionTimes.length > ROLLING_WINDOW) recentCompletionTimes.shift();

      if (sinceLastFlush >= FLUSH_EVERY || cursor >= pending.length) {
        sinceLastFlush = 0;
        saveProgress(progress);
      }

      if (done % PROGRESS_EVERY === 0 || done === pending.length) {
        const elapsedMs = Date.now() - t0;
        const remaining = pending.length - done;
        // 樣本不足一個視窗時（批次剛開始）退回累積平均，避免除以太小的樣本數失真。
        const avgMsPerSymbol =
          recentCompletionTimes.length >= 2
            ? (recentCompletionTimes[recentCompletionTimes.length - 1]! - recentCompletionTimes[0]!) / (recentCompletionTimes.length - 1)
            : elapsedMs / done;
        const etaMs = avgMsPerSymbol * remaining;
        console.log(
          `[full-history-pit] ${label} 進度 ${done}/${pending.length}（${((done / pending.length) * 100).toFixed(1)}%）` +
            ` 已耗時 ${(elapsedMs / 60000).toFixed(1)} 分鐘，預估剩餘 ${(etaMs / 60000).toFixed(1)} 分鐘（近 ${recentCompletionTimes.length} 筆速度），錯誤 ${errors.length} 筆`
        );
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(SYMBOL_CONCURRENCY, pending.length) }, () => worker()));

  progress.set(progressKey, alreadyDone);
  saveProgress(progress);

  console.log(`[full-history-pit] ${label} 完成，共 ${pending.length} 家，錯誤 ${errors.length} 筆，總耗時 ${((Date.now() - t0) / 60000).toFixed(1)} 分鐘`);
  writeFailuresFile(slug, errors);
  return errors;
};

const main = async () => {
  // 三大表讀取記憶化：同一家同一季被各 label 重複查 5–7 次，記憶化後實測快約 3 倍（見 memoizedStatements.ts）。
  memoizeStatementsForBackfill();
  await Promise.all(GENERAL_METRIC_CODES.map((code) => upsertMetricDefinition(metricDefinitionRegistry[code]!)));
  await Promise.all(BANK_METRIC_CODES.map((code) => upsertMetricDefinition(metricDefinitionRegistry[code]!)));

  const PILOT_LIMIT = process.env.PILOT_LIMIT ? Number(process.env.PILOT_LIMIT) : undefined;
  const PILOT_QUARTERS = process.env.PILOT_QUARTERS ? Number(process.env.PILOT_QUARTERS) : undefined;
  const ONLY_QUARTERS = process.env.ONLY_QUARTERS
    ? new Set(
        process.env.ONLY_QUARTERS.split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      )
    : undefined;
  const quarters = ONLY_QUARTERS
    ? QUARTERS.filter((q) => ONLY_QUARTERS.has(`${q.year}Q${q.season}`))
    : PILOT_QUARTERS
      ? QUARTERS.slice(0, PILOT_QUARTERS)
      : QUARTERS;

  const allErrors: BackfillFailure[] = [];
  const t0 = Date.now();
  const progress = loadProgress();
  if (progress.size > 0) {
    const totalDone = Array.from(progress.values()).reduce((sum, s) => sum + s.size, 0);
    console.log(`[full-history-pit] 讀到續跑進度檔，${progress.size} 個批次共 ${totalDone} 家公司已標記處理過`);
  }

  for (const { year, season } of quarters) {
    console.log(`\n[full-history-pit] ===== ${year}Q${season} 開始 =====`);
    const [generalSymbolsFull, bankSymbolsFull] = await Promise.all([getGeneralSymbolsForQuarter(year, season), getBankSymbolsForQuarter(year, season)]);
    const generalSymbols = PILOT_LIMIT ? generalSymbolsFull.slice(0, PILOT_LIMIT) : generalSymbolsFull;
    const bankSymbols = PILOT_LIMIT ? bankSymbolsFull.slice(0, Math.min(PILOT_LIMIT, bankSymbolsFull.length)) : bankSymbolsFull;

    const generalKey = batchKey(year, season, 'general');
    const bankKey = batchKey(year, season, 'bank');

    const generalErrors = await runQuarterBatch(
      `${year}Q${season} 一般指標`,
      `general-${year}q${season}`,
      generalSymbols,
      progress.get(generalKey) ?? new Set(),
      progress,
      generalKey,
      (symbol) => runTasks(buildGeneralTasks(symbol, { year, season }))
    );
    const bankErrors = await runQuarterBatch(
      `${year}Q${season} 銀行監理指標`,
      `bank-${year}q${season}`,
      bankSymbols,
      progress.get(bankKey) ?? new Set(),
      progress,
      bankKey,
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
    await disconnectAllDbs();
  });
