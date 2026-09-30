// 2026-09-30 從 refreshChangedQuartersPit.ts 抽出來的共用核心：給「每家公司最早變動的季」，從那一季重算到最新一季
// （全部一般指標，銀行再加銀行指標）。refreshChangedQuartersPit（照上游給的變動清單）跟 processUpstreamChangesPit
// （照 row_changes 換算）共用這一段。
//
// 三大表記憶化快取由呼叫端建一次傳進來，這裡**每次做完都清空**：處理程式會在同一個行程裡連續處理好幾批通知，
// 快取沒有失效機制，不清的話後一批會讀到前一批之前的舊財報，算出安靜的錯值。

import { buildGeneralTasks, buildBankTasks, runTasks } from './backfillTaskDefinitions';
import { backfillUniverse } from '../src/bootstrap/scripts';
import { getPastNQuarters, type Season } from '../src/domain/calendar/rocQuarter';
import { quarterIndex } from '../src/domain/upstream/recomputeTargets';

const CONCURRENCY = 8; // 守「DB 工作併發不超過 8」
const CLEAR_CACHE_EVERY = 100; // 每處理這麼多家公司清一次記憶化快取（見 memoizedStatements.ts 的無上限說明）

export interface QuarterlyRefreshFailure {
  symbol: string;
  year: string;
  season: string;
  label: string;
  message: string;
}

export interface QuarterlyRefreshResult {
  symbols: number;
  jobs: number;
  actions: Record<string, number>;
  failed: QuarterlyRefreshFailure[];
}

export const collectActions = (value: unknown, counts: Record<string, number>): void => {
  if (!value || typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  if (typeof record.action === 'string') {
    counts[record.action] = (counts[record.action] ?? 0) + 1;
    return;
  }
  for (const inner of Object.values(record)) collectActions(inner, counts);
};

// 目前最新一季（任何一家有損益表列就算）的 quarterIndex 與民國年季。
export const getLatestQuarter = async (): Promise<{ year: string; quarter: string; index: number }> => {
  const latest = await backfillUniverse.getLatestIncomeStatementQuarter();
  if (!latest) throw new Error('查不到任何損益表季度，無法決定重算終點。');
  return { ...latest, index: quarterIndex(Number(latest.year), Number(latest.quarter)) };
};

export const refreshFromQuarters = async (
  earliest: Map<string, number>,
  options: { logPrefix: string; memo: { clear: () => void }; dryRun?: boolean }
): Promise<QuarterlyRefreshResult> => {
  const { logPrefix, memo } = options;
  const latest = await getLatestQuarter();
  const bankSymbols = new Set((await backfillUniverse.listBankSymbols()).map((r) => r.symbol));

  const plan = [...earliest].map(([symbol, fromIndex]) => ({
    symbol,
    quarters: getPastNQuarters({ rocYear: Number(latest.year), season: latest.quarter as Season }, Math.max(latest.index - fromIndex + 1, 0)),
  }));
  const totalJobs = plan.reduce((sum, p) => sum + p.quarters.length, 0);
  console.log(`${logPrefix} ${plan.length} 家公司、${totalJobs} 個 (公司, 季)，重算到 ${latest.year}Q${latest.quarter}；其中銀行 ${plan.filter((p) => bankSymbols.has(p.symbol)).length} 家`);
  const result: QuarterlyRefreshResult = { symbols: plan.length, jobs: 0, actions: {}, failed: [] };
  if (options.dryRun || plan.length === 0) return result;

  const started = Date.now();
  let symbolsDone = 0;
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < plan.length) {
      const { symbol, quarters } = plan[cursor++]!;
      for (const quarter of quarters) {
        const tasks = [...buildGeneralTasks(symbol, quarter), ...(bankSymbols.has(symbol) ? buildBankTasks(symbol, quarter) : [])];
        const { failures, outcomes } = await runTasks(tasks);
        for (const { outcome } of outcomes) collectActions(outcome, result.actions);
        for (const f of failures) {
          const message = f.error instanceof Error ? f.error.message : String(f.error);
          result.failed.push({ symbol, year: quarter.year, season: quarter.season, label: f.label, message });
          console.error(`${logPrefix} ${symbol} ${quarter.year}Q${quarter.season} ${f.label} 失敗：${message}`);
        }
        result.jobs += 1;
      }
      symbolsDone += 1;
      if (symbolsDone % CLEAR_CACHE_EVERY === 0) memo.clear();
      if (symbolsDone % 50 === 0 || symbolsDone === plan.length) {
        const minutes = (Date.now() - started) / 60000;
        console.log(
          `${logPrefix} ${symbolsDone}/${plan.length} 家、${result.jobs}/${totalJobs} 個 (公司, 季)，已耗時 ${minutes.toFixed(1)} 分，` +
            `預估剩餘 ${((minutes / result.jobs) * (totalJobs - result.jobs)).toFixed(1)} 分，失敗 ${result.failed.length}`
        );
      }
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, plan.length) }, worker));
  } finally {
    memo.clear();
  }
  console.log(`${logPrefix} 完成：${result.jobs} 個 (公司, 季)，${((Date.now() - started) / 60000).toFixed(1)} 分，action 統計 ${JSON.stringify(result.actions)}`);
  return result;
};
