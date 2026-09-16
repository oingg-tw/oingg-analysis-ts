// 2026-09-13 使用者要求：精準回補——只對 scanMetricGapsPit.ts 找出來、真的有空缺的
// (公司, 季度) 組合重新計算，不對全市場全指標重跑。掃描/回填刻意分成兩支腳本（見
// scanMetricGapsPit.ts 檔頭說明），這支只負責讀報告執行，不自己重新掃描。
//
// 用法：
//   pnpm tsx scripts/scanMetricGapsPit.ts        （先掃描，產生 tmp/metric-gaps-report.json）
//   pnpm tsx scripts/backfillMetricGapsPit.ts     （讀報告，只重跑有空缺的組合）

import { readFileSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { GENERAL_METRIC_CODES, BANK_METRIC_CODES, buildGeneralTasks, buildBankTasks, runTasks, type BackfillFailure } from './backfillTaskDefinitions';
import { metricDefinitionRegistry, upsertMetricDefinition } from '../src/bootstrap/metricDefinitions';
import type { Season } from '../src/domain/calendar/rocQuarter';
import { disconnectAllDbs } from '../src/bootstrap/db';

const SYMBOL_CONCURRENCY = 8;
const PROGRESS_EVERY = 50;
const ROLLING_WINDOW = 30;

const REPORT_PATH = join(process.cwd(), 'tmp', 'metric-gaps-report.json');

interface GapReportEntry {
  general: string[];
  bank: string[];
}

const writeFailuresFile = (slug: string, failures: BackfillFailure[]): void => {
  const dir = join(process.cwd(), 'tmp');
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, `backfill-failures-${slug}.json`);
  if (failures.length === 0) {
    if (existsSync(filePath)) rmSync(filePath);
    return;
  }
  writeFileSync(filePath, JSON.stringify(failures, null, 2));
  console.log(`[backfill-gaps] 失敗清單已寫入 ${filePath}（${failures.length} 筆）`);
};

const runBatch = async (
  label: string,
  slug: string,
  symbols: string[],
  fn: (symbol: string) => Promise<{ failures: { label: string; error: unknown }[] }>
): Promise<BackfillFailure[]> => {
  if (symbols.length === 0) return [];
  console.log(`[backfill-gaps] ${label}：共 ${symbols.length} 家有空缺，併發數 ${SYMBOL_CONCURRENCY}`);
  const t0 = Date.now();
  let done = 0;
  const errors: BackfillFailure[] = [];
  const recentCompletionTimes: number[] = [];

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
          console.error(`[backfill-gaps] ${label} ${symbol} ${failure.label} 失敗：`, failure.error);
        }
      } catch (error) {
        errors.push({ symbol, label: '(whole-symbol)', message: error instanceof Error ? error.message : String(error) });
        console.error(`[backfill-gaps] ${label} ${symbol} 失敗：`, error);
      }
      done += 1;
      recentCompletionTimes.push(Date.now());
      if (recentCompletionTimes.length > ROLLING_WINDOW) recentCompletionTimes.shift();

      if (done % PROGRESS_EVERY === 0 || done === symbols.length) {
        const elapsedMs = Date.now() - t0;
        const remaining = symbols.length - done;
        const avgMsPerSymbol =
          recentCompletionTimes.length >= 2
            ? (recentCompletionTimes[recentCompletionTimes.length - 1]! - recentCompletionTimes[0]!) / (recentCompletionTimes.length - 1)
            : elapsedMs / done;
        const etaMs = avgMsPerSymbol * remaining;
        console.log(
          `[backfill-gaps] ${label} 進度 ${done}/${symbols.length}（${((done / symbols.length) * 100).toFixed(1)}%）` +
            ` 已耗時 ${(elapsedMs / 60000).toFixed(1)} 分鐘，預估剩餘 ${(etaMs / 60000).toFixed(1)} 分鐘，錯誤 ${errors.length} 筆`
        );
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(SYMBOL_CONCURRENCY, symbols.length) }, () => worker()));

  console.log(`[backfill-gaps] ${label} 完成，錯誤 ${errors.length} 筆，總耗時 ${((Date.now() - t0) / 60000).toFixed(1)} 分鐘`);
  writeFailuresFile(slug, errors);
  return errors;
};

const main = async () => {
  if (!existsSync(REPORT_PATH)) {
    console.error(`找不到 ${REPORT_PATH}，請先執行 pnpm tsx scripts/scanMetricGapsPit.ts 產生空缺報告。`);
    process.exitCode = 1;
    return;
  }

  const report = JSON.parse(readFileSync(REPORT_PATH, 'utf-8')) as Record<string, GapReportEntry>;

  await Promise.all(GENERAL_METRIC_CODES.map((code) => upsertMetricDefinition(metricDefinitionRegistry[code]!)));
  await Promise.all(BANK_METRIC_CODES.map((code) => upsertMetricDefinition(metricDefinitionRegistry[code]!)));

  const allErrors: BackfillFailure[] = [];
  const t0 = Date.now();

  for (const [key, entry] of Object.entries(report)) {
    const match = /^(\d+)Q([1-4])$/.exec(key);
    if (!match) {
      console.warn(`[backfill-gaps] 報告裡有格式不對的季度 key，跳過：${key}`);
      continue;
    }
    const year = match[1]!;
    const season = match[2] as Season;

    if (entry.general.length === 0 && entry.bank.length === 0) continue;

    console.log(`\n[backfill-gaps] ===== ${key} 開始 =====`);
    const generalErrors = await runBatch(
      `${key} 一般指標`,
      `gaps-general-${key.toLowerCase()}`,
      entry.general,
      (symbol) => runTasks(buildGeneralTasks(symbol, { year, season }))
    );
    const bankErrors = await runBatch(
      `${key} 銀行監理指標`,
      `gaps-bank-${key.toLowerCase()}`,
      entry.bank,
      (symbol) => runTasks(buildBankTasks(symbol, { year, season }))
    );
    allErrors.push(...generalErrors.map((e) => ({ ...e, label: `${key}:${e.label}` })), ...bankErrors.map((e) => ({ ...e, label: `${key}:${e.label}` })));
  }

  console.log(`\n[backfill-gaps] 全部完成，總錯誤 ${allErrors.length} 筆，總耗時 ${((Date.now() - t0) / 60000).toFixed(1)} 分鐘`);
  if (allErrors.length > 0) {
    writeFailuresFile('gaps-all', allErrors);
  }
  console.log(`[backfill-gaps] 建議回填完後重新執行一次 scanMetricGapsPit.ts 確認空缺是否真的解決（insufficient_history 在最早幾季可能是永久性的，重跑也不會消失，見該腳本檔頭說明）。`);
};

main()
  .catch((error) => {
    console.error('精準回補腳本執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectAllDbs();
  });
