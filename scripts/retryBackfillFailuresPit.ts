// 2026-09-11 使用者要求：全市場 backfill 如果有 error，希望有機制可以精準回補——不是
// 整批重跑，只重跑真正失敗的那幾個 (symbol, label) 組合。這支腳本讀
// scripts/backfillAllMetricsLatestFullMarketPit.ts 執行完寫出的
// tmp/backfill-failures-<slug>.json（一般公司是 general、銀行是 bank），對每個
// symbol 只重跑清單裡列出的那幾支指標（用同一份 buildGeneralTasks/buildBankTasks 共用
// 清單篩選，不是重新寫一份 61 支指標的呼叫），成功的從清單移除，還是失敗的保留、重寫
// 回同一個檔案（可以重複執行這支腳本直到清單清空或確認是真的資料缺口不是暫時性錯誤）。
//
// 用法：pnpm tsx scripts/retryBackfillFailuresPit.ts [general|bank|all]（預設 all）

import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { buildGeneralTasks, buildBankTasks, runTasks, type BackfillFailure } from './backfillTaskDefinitions';
import { disconnectAllDbs } from '../src/bootstrap/db';

const SLUGS_BY_ARG: Record<string, ('general' | 'bank')[]> = {
  general: ['general'],
  bank: ['bank'],
  all: ['general', 'bank'],
};

const TASK_BUILDERS: Record<'general' | 'bank', (symbol: string) => [string, () => Promise<unknown>][]> = {
  general: buildGeneralTasks,
  bank: buildBankTasks,
};

const failuresFilePath = (slug: string): string => join(process.cwd(), 'tmp', `backfill-failures-${slug}.json`);

const readFailures = (slug: string): BackfillFailure[] => {
  const filePath = failuresFilePath(slug);
  if (!existsSync(filePath)) return [];
  return JSON.parse(readFileSync(filePath, 'utf-8')) as BackfillFailure[];
};

const writeFailures = (slug: string, failures: BackfillFailure[]): void => {
  const filePath = failuresFilePath(slug);
  if (failures.length === 0) {
    if (existsSync(filePath)) rmSync(filePath);
    return;
  }
  writeFileSync(filePath, JSON.stringify(failures, null, 2));
};

const retrySlug = async (slug: 'general' | 'bank'): Promise<void> => {
  const failures = readFailures(slug);
  if (failures.length === 0) {
    console.log(`[retry-backfill] ${slug}：沒有失敗清單，跳過`);
    return;
  }

  const bySymbol = new Map<string, Set<string>>();
  for (const failure of failures) {
    if (!bySymbol.has(failure.symbol)) bySymbol.set(failure.symbol, new Set());
    bySymbol.get(failure.symbol)!.add(failure.label);
  }

  console.log(`[retry-backfill] ${slug}：讀到 ${failures.length} 筆失敗記錄，涵蓋 ${bySymbol.size} 家公司，開始逐一重跑`);

  const buildTasks = TASK_BUILDERS[slug];
  const stillFailing: BackfillFailure[] = [];
  let retried = 0;
  let fixed = 0;

  for (const [symbol, labels] of bySymbol) {
    const allTasks = buildTasks(symbol);
    const tasksToRetry = allTasks.filter(([label]) => labels.has(label));
    if (tasksToRetry.length === 0) {
      console.log(`[retry-backfill] ${slug} ${symbol}：失敗清單裡的 label 在目前的任務清單裡找不到，可能指標已改名，略過`);
      continue;
    }

    const { failures: retryFailures } = await runTasks(tasksToRetry);
    retried += tasksToRetry.length;
    fixed += tasksToRetry.length - retryFailures.length;

    for (const failure of retryFailures) {
      const message = failure.error instanceof Error ? failure.error.message : String(failure.error);
      stillFailing.push({ symbol, label: failure.label, message });
      console.error(`[retry-backfill] ${slug} ${symbol} ${failure.label} 仍然失敗：`, failure.error);
    }
  }

  writeFailures(slug, stillFailing);
  console.log(
    `[retry-backfill] ${slug} 完成：重跑 ${retried} 筆，修復 ${fixed} 筆，仍失敗 ${stillFailing.length} 筆` +
      (stillFailing.length > 0 ? `（已重寫回 ${failuresFilePath(slug)}，可再跑一次這支腳本，或是真的資料缺口不用再重試）` : '（失敗清單已清空並刪除）')
  );
};

const main = async () => {
  const arg = process.argv[2] ?? 'all';
  const slugs = SLUGS_BY_ARG[arg];
  if (!slugs) {
    console.error(`未知的參數 "${arg}"，只接受 general/bank/all。`);
    process.exitCode = 1;
    return;
  }

  for (const slug of slugs) {
    await retrySlug(slug);
  }
};

main()
  .catch((error) => {
    console.error('精準回補腳本執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectAllDbs();
  });
