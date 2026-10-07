// 2026-09-30 上游變動的處理程式（使用者拍板：上游 POST「處理到第幾筆」→ 我們存待辦 → 這支依序處理）。
// 由 POST /upstream/changes 入列後叫醒（Cloud Run Job），本機也可以手動跑：pnpm tsx scripts/processUpstreamChangesPit.ts
//
// 流程：拿處理權租約（同一時間只跑一個，守 DB 併發 ≤ 8）→ 對每個有待辦的來源，讀它 export.row_changes 在
// (上次做完, 這次要做到] 那一段 → domain/upstream/recomputeTargets 換算 → 季報型從最早變動季重算到最新、逐日型重算最新一筆、
// SUS 從變動月重算到本月 → 把這段待辦標成做完並附處理摘要 → 直到沒有待辦才放掉租約；放掉之後再看一次，有新待辦就再拿。
//
// 刻意**沒有**兜底（使用者：現階段兜底會掩蓋正向流程的缺失）：認不得的表進摘要的 unmapped、任務失敗進 failed，
// 都寫在待辦表的 summary 欄給人看，不自動補、不重試。整段處理丟例外才把那段待辦標成 failed（下次會從上次做完處重做）。

import { appDeps } from '../src/bootstrap/deps';
import { disconnectAllDbs } from '../src/bootstrap/db';
import { memoizeStatementsForBackfill } from '../src/bootstrap/memoizedStatements';
import { backfillUniverse, reportAvailability } from '../src/bootstrap/scripts';
import {
  computeAndWriteLiveGrahamNumberPit,
  computeAndWriteLiveMarketCapPit,
  computeAndWriteLiveDividendPerSharePit,
  computeAndWriteLivePbRatioPit,
  computeAndWriteLivePegRatioPit,
  computeAndWriteLivePeRatioPit,
  MONTHLY_METRIC_PITS,
} from '../src/bootstrap/pitMetrics';
import { quarterIndex, toRecomputeTargets, type UpstreamSource } from '../src/domain/upstream/recomputeTargets';
import { buildGeneralTasks, runTasks } from './backfillTaskDefinitions';
import { collectActions, getLatestQuarter, refreshFromQuarters } from './quarterlyRefresh';
import { rankAndWriteMagicFormula } from './magicFormulaRank';

const HOLDER = `${process.env.CLOUD_RUN_EXECUTION ?? 'local'}-${process.pid}`;
const LEASE_MINUTES = 120; // 要比最長一批處理時間長；處理程式死掉的話，租約過期後下一次叫醒的人可以接手
const HISTORY_FLOOR = quarterIndex(109, 3); // 全市場歷史回填的起點，見 project_history_backfill_depth
const CONCURRENCY = 8;
const DAILY_LABELS = new Set(['beta', 'marketRatios', 'fiftyTwoWeek', 'foreignNetBuy20d']);

const runPool = async <T>(items: T[], fn: (item: T) => Promise<void>): Promise<void> => {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (cursor < items.length) await fn(items[cursor++]!);
  }));
};

const monthsFrom = (ym: number): string[] => {
  const now = new Date();
  const end = now.getUTCFullYear() * 100 + now.getUTCMonth() + 1;
  const months: string[] = [];
  for (let y = Math.floor(ym / 100), m = ym % 100; y * 100 + m <= end; m === 12 ? ((y += 1), (m = 1)) : (m += 1)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
  }
  return months;
};

const processSource = async (source: UpstreamSource, fromExclusive: bigint, toInclusive: bigint, memo: { clear: () => void }): Promise<Record<string, unknown>> => {
  const prefix = `[upstream ${source} (${fromExclusive}, ${toInclusive}]]`;
  const changes = await appDeps.upstreamRowChanges.list(source, fromExclusive, toInclusive);
  const latest = await getLatestQuarter();
  const targets = toRecomputeTargets(changes, { historyFloorIndex: HISTORY_FLOOR, latestQuarterIndex: latest.index });
  console.log(`${prefix} ${changes.length} 筆變動 → 季報型 ${targets.quarterlyFrom.size} 家、逐日型 ${targets.dailyLatestAll ? '全市場' : `${targets.dailyLatest.size} 家`}、SUS ${targets.monthlyFrom.size} 家`);
  if (targets.unmapped.size > 0) console.warn(`${prefix} 認不得的表／鍵（沒有重算，要人看）：${JSON.stringify(Object.fromEntries(targets.unmapped))}`);

  const quarterly = await refreshFromQuarters(targets.quarterlyFrom, { logPrefix: prefix, memo });

  // 2026-10-01 使用者要求神奇公式排名接進每日自動重算：它是全市場橫斷面排名，季報重算改到任何一家的 greenblattRoc／
  // greenblattEarningsYield，所有人的名次都可能變。只在這一批真的跑了季報重算時重排（兩支底層都是季報型，股價取知識日當天，
  // 逐日行情變動不影響），名次沒變的列 skipped_unchanged。
  const magicFormula = quarterly.jobs > 0 ? await rankAndWriteMagicFormula(`${prefix} [magicFormulaRank]`) : null;

  // 逐日型只算我們的公司母體（最新一季有損益表的公司）。2026-09-30 tpex 第一次實打就踩到：上櫃 daily_price 每天約 1.1 萬列，
  // 九成是權證與 ETF，不過濾的話會替 7,610 檔權證寫 liveMarketCap 的空值列。排除的檔數寫進摘要給人看，不默默丟。
  const universe = new Set((await backfillUniverse.listSymbolsWithIncomeStatement(latest.year, latest.quarter)).map((r) => r.symbol));
  const dailySymbols = targets.dailyLatestAll ? [...universe] : [...targets.dailyLatest].filter((s) => universe.has(s));
  const excludedNonCompany = targets.dailyLatestAll ? 0 : targets.dailyLatest.size - dailySymbols.length;
  if (excludedNonCompany > 0) console.log(`${prefix} 逐日型排除 ${excludedNonCompany} 檔不在公司母體的代號（權證、ETF 等）`);
  const daily = { symbols: dailySymbols.length, excludedNonCompany, actions: {} as Record<string, number>, failed: [] as string[] };
  await runPool(dailySymbols, async (symbol) => {
    const query = { symbol, dataType: await reportAvailability.resolveDataType(symbol), subsidiaryCompanyId: '' };
    const { failures, outcomes } = await runTasks(buildGeneralTasks(symbol).filter(([label]) => DAILY_LABELS.has(label)));
    for (const { outcome } of outcomes) collectActions(outcome, daily.actions);
    for (const f of failures) daily.failed.push(`${symbol} ${f.label}: ${f.error instanceof Error ? f.error.message : String(f.error)}`);
    const live = await Promise.allSettled([
      computeAndWriteLiveGrahamNumberPit(query),
      computeAndWriteLivePegRatioPit(query),
      computeAndWriteLiveMarketCapPit(query),
      computeAndWriteLivePeRatioPit(query),
      computeAndWriteLivePbRatioPit(query),
      // 2026-10-05 近 12 個月每股股利（截至最新交易日）：窗口每天往前滾，跟其他 live* 一起每個交易日重算。
      computeAndWriteLiveDividendPerSharePit(query),
    ]);
    for (const r of live) {
      if (r.status === 'fulfilled') collectActions(r.value, daily.actions);
      else daily.failed.push(`${symbol} live: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
    }
  });

  const monthly = { symbols: targets.monthlyFrom.size, actions: {} as Record<string, number>, failed: [] as string[] };
  await runPool([...targets.monthlyFrom], async ([symbol, ym]) => {
    const dataType = await reportAvailability.resolveDataType(symbol);
    for (const yearMonth of monthsFrom(ym)) {
      try {
        // 2026-10-07 跑整份月頻清單（sus、revenueYoy3m…），不再寫死 sus。
        for (const run of Object.values(MONTHLY_METRIC_PITS)) collectActions(await run({ symbol, yearMonth, dataType, subsidiaryCompanyId: '' }), monthly.actions);
      } catch (error) {
        monthly.failed.push(`${symbol} ${yearMonth}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  });

  const summary = {
    changes: changes.length,
    quarterly: { symbols: quarterly.symbols, jobs: quarterly.jobs, actions: quarterly.actions, failedCount: quarterly.failed.length, failedSample: quarterly.failed.slice(0, 20) },
    daily: { ...daily, failedCount: daily.failed.length, failed: daily.failed.slice(0, 20) },
    magicFormulaRank: magicFormula,
    monthly: { ...monthly, failedCount: monthly.failed.length, failed: monthly.failed.slice(0, 20) },
    ignored: Object.fromEntries(targets.ignored),
    unmapped: Object.fromEntries(targets.unmapped),
  };
  console.log(`${prefix} 完成：${JSON.stringify({ quarterlyFailed: quarterly.failed.length, dailyFailed: daily.failed.length, monthlyFailed: monthly.failed.length, unmapped: summary.unmapped })}`);
  return summary;
};

const drainQueue = async (memo: { clear: () => void }): Promise<void> => {
  for (;;) {
    const ranges = await appDeps.upstreamQueue.listPendingRanges();
    if (ranges.length === 0) return;
    for (const { source, fromExclusive, toInclusive } of ranges) {
      await appDeps.upstreamQueue.acquireLease(HOLDER, LEASE_MINUTES); // 續租
      try {
        const summary = await processSource(source, fromExclusive, toInclusive, memo);
        await appDeps.upstreamQueue.complete(source, toInclusive, summary);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[upstream ${source}] 整段處理失敗，標成 failed（下次從上次做完處重做）：`, error);
        await appDeps.upstreamQueue.fail(source, toInclusive, message);
      }
    }
  }
};

const main = async () => {
  const memo = memoizeStatementsForBackfill();
  for (;;) {
    if (!(await appDeps.upstreamQueue.acquireLease(HOLDER, LEASE_MINUTES))) {
      console.log('[upstream] 另一個處理程式正在跑，它會處理到待辦清空為止，這次直接結束。');
      return;
    }
    try {
      await drainQueue(memo);
    } finally {
      await appDeps.upstreamQueue.releaseLease(HOLDER);
    }
    // 放掉租約之後再看一次：放掉前一刻才入列的待辦，叫醒的那個處理程式可能剛好被租約擋掉而結束了。
    if ((await appDeps.upstreamQueue.listPendingRanges()).length === 0) return;
  }
};

main()
  .catch((error) => {
    console.error('[upstream] 處理程式失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectAllDbs();
  });
