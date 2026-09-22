// 全市場、指定任務 label、指定季度（或最新一季）的精準回補——公式改版後「只重算受影響的那幾支」用這支，
// 不用整批跑 backfillAllMetricsLatestFullMarketPit（2026-09-22 從 tmp/ 正名進 scripts/，它已經是常用工具）。
// 用法：LABELS=roe,roa QUARTERS=113Q1,113Q2 pnpm tsx scripts/backfillTargetedPit.ts
//   LABELS        逗號分隔的任務 label（buildGeneralTasks 的第一個元素），必填
//   QUARTERS      逗號分隔的民國年季度；省略 = 每支 compute 自己解析最新一季
//   CONCURRENCY   symbol×季 的併發數，預設 8（DB 連線池 connection_limit=5，調高效益有限）
//   SYMBOL_LIMIT  只跑前 N 家，測試用
import 'dotenv/config';
import { buildGeneralTasks, runTasks } from './backfillTaskDefinitions';
import { backfillUniverse } from '../src/bootstrap/scripts';
import { disconnectAllDbs } from '../src/bootstrap/db';
import type { Season } from '../src/domain/calendar/rocQuarter';
import { memoizeStatementsForBackfill } from '../src/bootstrap/memoizedStatements';

const CONCURRENCY = Number(process.env.CONCURRENCY ?? 8);
const labels = new Set((process.env.LABELS ?? '').split(',').map((s) => s.trim()).filter(Boolean));
const quarters: ({ year: string; season: Season } | undefined)[] = process.env.QUARTERS
  ? process.env.QUARTERS.split(',').map((q) => ({ year: q.slice(0, -2), season: q.slice(-1) as Season }))
  : [undefined];

void (async () => {
  memoizeStatementsForBackfill();
  const symbols = (await backfillUniverse.listSymbolsWithIncomeStatement('115', '2')).map((r) => r.symbol).slice(0, Number(process.env.SYMBOL_LIMIT ?? Infinity));
  console.log(`symbols=${symbols.length} labels=${[...labels].join(',')} quarters=${quarters.map((q) => (q ? `${q.year}Q${q.season}` : 'latest')).join(',')}`);
  const started = Date.now();
  let done = 0;
  let failures = 0;
  const jobs = symbols.flatMap((symbol) => quarters.map((quarter) => ({ symbol, quarter })));
  let cursor = 0;
  const worker = async () => {
    while (cursor < jobs.length) {
      const { symbol, quarter } = jobs[cursor++]!;
      const tasks = buildGeneralTasks(symbol, quarter).filter(([label]) => labels.has(label));
      const { failures: f } = await runTasks(tasks);
      if (f.length > 0) {
        failures += f.length;
        console.error(`[${symbol} ${quarter ? `${quarter.year}Q${quarter.season}` : 'latest'}] ${f.map((x) => `${x.label}: ${String(x.error)}`).join('; ')}`);
      }
      done++;
      if (done % 200 === 0) {
        const mins = (Date.now() - started) / 60000;
        console.log(`progress ${done}/${jobs.length} elapsed ${mins.toFixed(1)}m eta ${((mins / done) * (jobs.length - done)).toFixed(1)}m failures ${failures}`);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`done ${done}/${jobs.length} failures ${failures} total ${((Date.now() - started) / 60000).toFixed(1)}m`);
  await disconnectAllDbs();
})();
