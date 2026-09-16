// 2026-09-17 clean architecture 重構 Phase 0：指標核心的「寫入值 byte-identical」證明工具。
//
// 原理：metricValueWriter 寫入前會拿既有列比對（decideWrite），值/nullReason 沒變就回
// skipped_unchanged、不寫。所以「對同一批座標重跑一次 compute，每個 basis 都回 skipped_*」
// 就是「重構後算出來的值跟 DB 裡的完全一樣」的直接證據——不用另外做 golden 數值檔。
// 反過來：updated_same_knowledge_date = 值變了；季報型出現 inserted = knowledge_date 變了；
// rejected = 座標/註冊出了問題。三種都是重構破壞了計算的訊號。
//
// 涵蓋範圍（固定，才能跟 baseline 逐筆比對）：scripts/pitBackfillFixtures.ts 的 2330/2887/2317
// × 113Q3–115Q2 跑全部一般指標（buildGeneralTasks 指定 quarter → 只有季報型）、2801/2812 跑
// 銀行指標；逐日型（beta/marketRatios）另外用固定的 date 跑，不然「最新交易日」每天漂移會
// 變成合法的 inserted 而不是回歸。
//
// 用法：
//   pnpm verify:equivalence -- --label baseline               # Phase 0，未遷移的程式碼，建立基準
//   pnpm verify:equivalence -- --label roe-family --compare baseline   # 每遷完一個 family 對照
// 輸出 tmp/equivalence-<label>.json（tmp/ 不進版控）。--compare 模式下任何一筆 action 跟
// baseline 不同、或出現 inserted/updated_same_knowledge_date/rejected/失敗，都以 exit code 1 結束。
// 第二個獨立證據：跑的期間 metric_upsert_shadow（真的覆蓋既有列時才會寫）新增列數必須是 0。
//
// 目標資料庫跟著 .env 的 ANALYSIS_DATABASE_URL（開發 DB，真實值在那裡）；要對 Neon 測試分支跑就
// ANALYSIS_DATABASE_URL=$ANALYSIS_DATABASE_URL_TEST pnpm verify:equivalence -- ...。
// baseline 跟對照要同一天跑，避免上游財報重編被誤判成回歸。

import 'dotenv/config';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildGeneralTasks, buildBankTasks, runTasks, type BackfillTask } from './backfillTaskDefinitions';
import { PIT_BACKFILL_SYMBOLS, PIT_BACKFILL_QUARTERS } from './pitBackfillFixtures';
import { computeAndWriteBetaPit, computeAndWriteMarketRatiosPit } from '../src/bootstrap/pitMetrics';
import { analysisPrisma } from '../src/infrastructure/prisma/analysisClient';
import { disconnectAllDbs } from '../src/bootstrap/db';

const BANK_SYMBOLS = ['2801', '2812'];
const DAILY_PINNED_DATE = new Date('2026-09-01');
const BREAKING_ACTIONS = new Set(['inserted', 'updated_same_knowledge_date', 'rejected']);

interface Entry {
  symbol: string;
  label: string;
  key: string; // outcome 物件裡通往這個 basis 的路徑，例如 "q"、"ttm"、"grossMarginQ"、"windows.1Y_1D"
  action: string;
}

interface Report {
  label: string;
  generatedAt: string;
  pinnedDailyDate: string;
  counts: Record<string, number>;
  shadowRowsDuringRun: number;
  failures: { symbol: string; label: string; message: string }[];
  entries: Entry[];
}

const parseArgs = (argv: string[]): { label: string; compare: string | null } => {
  let label = 'run';
  let compare: string | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--label' && argv[i + 1]) label = argv[++i]!;
    else if (argv[i] === '--compare' && argv[i + 1]) compare = argv[++i]!;
  }
  return { label, compare };
};

// 每個 compute 函式的 outcome 形狀都不一樣（StandardBasisPitOutcome 的 q/ttm/fy、family 的
// 具名欄位、beta 的多個窗口…），但共同點是：每個 basis 的結果都是一個帶字串 action 的物件。
// 遞迴走訪、遇到 action 就收一筆，不用知道每支指標的具體形狀。
const collectActions = (value: unknown, path: string[], out: { key: string; action: string }[]): void => {
  if (!value || typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  if (typeof record.action === 'string') {
    out.push({ key: path.join('.'), action: record.action });
    return;
  }
  for (const [key, inner] of Object.entries(record)) collectActions(inner, [...path, key], out);
};

const reportPath = (label: string): string => join(process.cwd(), 'tmp', `equivalence-${label}.json`);

const main = async (): Promise<void> => {
  const { label, compare } = parseArgs(process.argv.slice(2));
  const startedAt = new Date();
  const entries: Entry[] = [];
  const failures: Report['failures'] = [];

  const runAndCollect = async (symbol: string, tasks: BackfillTask[]): Promise<void> => {
    const result = await runTasks(tasks);
    for (const failure of result.failures) {
      failures.push({ symbol, label: failure.label, message: failure.error instanceof Error ? failure.error.message : String(failure.error) });
    }
    for (const { label: taskLabel, outcome } of result.outcomes) {
      const actions: { key: string; action: string }[] = [];
      collectActions(outcome, [], actions);
      for (const { key, action } of actions) entries.push({ symbol, label: taskLabel, key, action });
    }
  };

  for (const symbol of PIT_BACKFILL_SYMBOLS) {
    for (const quarter of PIT_BACKFILL_QUARTERS) {
      await runAndCollect(symbol, buildGeneralTasks(symbol, quarter));
    }
    const dailyQuery = { symbol, dataType: '2' as const, subsidiaryCompanyId: '', date: DAILY_PINNED_DATE };
    await runAndCollect(symbol, [
      ['beta', () => computeAndWriteBetaPit(dailyQuery)],
      ['marketRatios', () => computeAndWriteMarketRatiosPit(dailyQuery)],
    ]);
    console.log(`[verify-equivalence] ${symbol} 完成，累計 ${entries.length} 筆 basis outcome`);
  }
  for (const symbol of BANK_SYMBOLS) {
    for (const quarter of PIT_BACKFILL_QUARTERS) {
      await runAndCollect(symbol, buildBankTasks(symbol, quarter));
    }
    console.log(`[verify-equivalence] ${symbol}（銀行）完成，累計 ${entries.length} 筆 basis outcome`);
  }

  const shadowRowsDuringRun = await analysisPrisma.metricUpsertShadow.count({ where: { capturedAt: { gte: startedAt } } });

  const counts: Record<string, number> = {};
  for (const entry of entries) counts[entry.action] = (counts[entry.action] ?? 0) + 1;

  const report: Report = { label, generatedAt: startedAt.toISOString(), pinnedDailyDate: DAILY_PINNED_DATE.toISOString().slice(0, 10), counts, shadowRowsDuringRun, failures, entries };
  mkdirSync(join(process.cwd(), 'tmp'), { recursive: true });
  writeFileSync(reportPath(label), JSON.stringify(report, null, 2));

  console.log(`[verify-equivalence] label=${label} counts=${JSON.stringify(counts)} shadowRowsDuringRun=${shadowRowsDuringRun} failures=${failures.length}`);
  console.log(`[verify-equivalence] 報告已寫入 ${reportPath(label)}`);

  let problems = failures.length;
  if (shadowRowsDuringRun > 0) {
    // baseline 模式（沒有 --compare）第一次跑，DB 裡可能還有舊版程式碼/舊上游資料留下的值，
    // 被現行程式碼覆蓋是正常的「把 DB 追上程式碼」——只警告，真正的基準要用第二次跑
    // （應該全部 skipped_*）的結果。--compare 模式下任何覆蓋都是回歸。
    const line = `[verify-equivalence] metric_upsert_shadow 在跑的期間新增了 ${shadowRowsDuringRun} 列——有既有列被真的覆蓋了。`;
    if (compare) {
      console.error(line);
      problems += shadowRowsDuringRun;
    } else {
      console.warn(`${line} baseline 模式：請再跑一次確認第二次全部是 skipped_*，以第二次的報告當基準。`);
    }
  }

  if (compare) {
    const baselineFile = reportPath(compare);
    if (!existsSync(baselineFile)) throw new Error(`找不到 baseline 報告 ${baselineFile}，先跑 --label ${compare}。`);
    const baseline = JSON.parse(readFileSync(baselineFile, 'utf8')) as Report;
    const keyOf = (e: Entry) => `${e.symbol}|${e.label}|${e.key}`;
    const baselineByKey = new Map(baseline.entries.map((e) => [keyOf(e), e.action]));
    const currentByKey = new Map(entries.map((e) => [keyOf(e), e.action]));

    const diffs: string[] = [];
    for (const [key, action] of currentByKey) {
      const before = baselineByKey.get(key);
      if (before === undefined) diffs.push(`新增的 basis：${key} → ${action}`);
      else if (before !== action) diffs.push(`${key}：baseline=${before} 現在=${action}`);
      else if (BREAKING_ACTIONS.has(action)) diffs.push(`${key}：${action}（跟 baseline 一樣但不該出現，代表兩次都在改值）`);
    }
    for (const key of baselineByKey.keys()) {
      if (!currentByKey.has(key)) diffs.push(`消失的 basis：${key}`);
    }
    if (diffs.length > 0) {
      console.error(`[verify-equivalence] 跟 baseline（${compare}）有 ${diffs.length} 筆差異：`);
      for (const line of diffs.slice(0, 200)) console.error(`  - ${line}`);
      if (diffs.length > 200) console.error(`  …另外 ${diffs.length - 200} 筆，完整內容比對 tmp/ 裡兩份報告的 entries。`);
      problems += diffs.length;
    } else {
      console.log(`[verify-equivalence] 跟 baseline（${compare}）逐筆一致：${entries.length} 筆 basis outcome 全部相同。`);
    }
  }

  if (problems > 0) process.exitCode = 1;
};

main()
  .catch((error) => {
    console.error('[verify-equivalence] 執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectAllDbs();
  });
