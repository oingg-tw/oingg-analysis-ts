// 2026-09-14 使用者要求：把「精準回補」跟「全部指標回補」拆成兩支不同用途的腳本——
// 全部指標回補（全市場、全歷史、全指標）繼續用 backfillFullHistoryFullMarketPit.ts；
// 這支負責「精準」回補：呼叫端指定公司/季度/指標任意組合（可以只給其中一種、可以三種
// 都給），只重算指定範圍，不是全市場全歷史全指標下去重跑。
//
// 取代原本針對單一公司寫死的一次性腳本（backfillCagr2330AllQuarters.ts /
// backfillAllMetrics2330AllQuarters.ts）——那兩支各自寫死 SYMBOL/QUARTERS/指標清單，
// 下次要對另一家公司或另一組指標做同樣的事又要複製一份幾乎一樣的腳本。這支用環境變數
// 收三個篩選條件，任一個都可以留空（留空 = 不篩選那個維度）：
//
//   SYMBOLS       逗號分隔的公司代號清單，例如 "2330,1229"。省略 = 報錯（避免不小心
//                 對全市場下去跑，全市場範圍請用 backfillFullHistoryFullMarketPit.ts）。
//   QUARTERS      逗號分隔的民國年季度，例如 "109Q4,110Q1"。省略 = 只跑各自 compute*Pit
//                 函式「省略 year/season 時自動解析最新可用季度」的既有慣例（見
//                 computeGrahamNumberPit.ts 的說明），也就是只算最新一筆。
//   METRIC_LABELS 逗號分隔的任務 label（buildGeneralTasks/buildBankTasks 裡的第一個
//                 陣列元素，例如 "revenueCagrFamily,epsCagrFamily"，不是 metricCode——
//                 家族函式一次寫多個 metricCode，沒辦法只重算其中一個不動其他兄弟，
//                 篩選粒度只能到「任務」這一層，跟 scanMetricGapsPit.ts 的既有限制一致）。
//                 省略 = 不篩選，跑 buildGeneralTasks 回傳的全部任務。
//   INCLUDE_BANK  設成 "1" 才會額外跑 buildBankTasks（預設不跑，多數個股用不到）。
//
// 用法範例：
//   SYMBOLS=2330 QUARTERS=109Q4,110Q1,110Q2,110Q3,110Q4,111Q1,111Q2,111Q3,111Q4,112Q1,112Q2,112Q3,112Q4,113Q1,113Q2,113Q3,113Q4,114Q1,114Q2,114Q3,114Q4,115Q1,115Q2 \
//   pnpm tsx scripts/backfillPreciseTargetPit.ts
//     → 2330 全部已知季度、全部一般指標（取代 backfillAllMetrics2330AllQuarters.ts）。
//
//   SYMBOLS=2330 QUARTERS=109Q4,...,115Q2 METRIC_LABELS=revenueCagrFamily,epsCagrFamily,dividendGrowthRateFamily \
//   pnpm tsx scripts/backfillPreciseTargetPit.ts
//     → 2330 全部已知季度、只跑三個 CAGR 家族（取代 backfillCagr2330AllQuarters.ts）。
//
//   SYMBOLS=2330,1229 pnpm tsx scripts/backfillPreciseTargetPit.ts
//     → 兩家公司，不指定季度（只算各自最新一筆），全部一般指標。

import { buildGeneralTasks, buildBankTasks, runTasks, type BackfillTask } from './backfillTaskDefinitions';
import type { Season } from '../src/domain/calendar/rocQuarter';
import { disconnectAllDbs } from '../src/bootstrap/db';
import { memoizeStatementsForBackfill } from '../src/bootstrap/memoizedStatements';

const parseCsv = (value: string | undefined): string[] | undefined => {
  if (!value) return undefined;
  const parsed = value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return parsed.length > 0 ? parsed : undefined;
};

const parseQuarters = (value: string | undefined): { year: string; season: Season }[] | undefined => {
  const raw = parseCsv(value);
  if (!raw) return undefined;
  return raw.map((token) => {
    const match = /^(\d+)Q([1-4])$/.exec(token);
    if (!match) throw new Error(`QUARTERS 格式錯誤："${token}"，要是「民國年+Q+季別」，例如 "113Q1"。`);
    return { year: match[1]!, season: match[2] as Season };
  });
};

const filterByLabels = (tasks: BackfillTask[], labels: string[] | undefined): BackfillTask[] => {
  if (!labels) return tasks;
  const labelSet = new Set(labels);
  const filtered = tasks.filter(([label]) => labelSet.has(label));
  const missing = labels.filter((label) => !tasks.some(([taskLabel]) => taskLabel === label));
  if (missing.length > 0) {
    throw new Error(`METRIC_LABELS 裡有不存在的任務 label：${missing.join(', ')}。可用清單見 backfillTaskDefinitions.ts 的 buildGeneralTasks/buildBankTasks。`);
  }
  return filtered;
};

const main = async () => {
  // 三大表讀取記憶化：同一家同一季被各 label 重複查 5–7 次，記憶化後實測快約 3 倍（見 memoizedStatements.ts）。
  memoizeStatementsForBackfill();
  const symbols = parseCsv(process.env.SYMBOLS);
  if (!symbols) {
    console.error('SYMBOLS 必填（逗號分隔的公司代號清單），避免不小心對全市場下去跑。全市場範圍請用 backfillFullHistoryFullMarketPit.ts。');
    process.exitCode = 1;
    return;
  }
  const quarters = parseQuarters(process.env.QUARTERS);
  const metricLabels = parseCsv(process.env.METRIC_LABELS);
  const includeBank = process.env.INCLUDE_BANK === '1';

  const quarterList: ({ year: string; season: Season } | undefined)[] = quarters ?? [undefined];

  let totalFailures = 0;
  for (const symbol of symbols) {
    for (const quarter of quarterList) {
      const label = quarter ? `${quarter.year}Q${quarter.season}` : '(最新可用季度)';
      const generalTasks = filterByLabels(buildGeneralTasks(symbol, quarter), metricLabels);
      const { failures } = await runTasks(generalTasks);
      if (failures.length > 0) {
        totalFailures += failures.length;
        console.error(`[${symbol} ${label}] ${failures.length} 個任務失敗：`, failures.map((f) => `${f.label}: ${String(f.error)}`).join('\n'));
      } else {
        console.log(`[${symbol} ${label}] 完成，共 ${generalTasks.length} 個任務，無失敗。`);
      }

      if (includeBank) {
        const bankTasks = filterByLabels(buildBankTasks(symbol, quarter), metricLabels);
        const { failures: bankFailures } = await runTasks(bankTasks);
        if (bankFailures.length > 0) {
          totalFailures += bankFailures.length;
          console.error(`[${symbol} ${label}] 銀行監理指標 ${bankFailures.length} 個任務失敗：`, bankFailures.map((f) => `${f.label}: ${String(f.error)}`).join('\n'));
        } else if (bankTasks.length > 0) {
          console.log(`[${symbol} ${label}] 銀行監理指標完成，共 ${bankTasks.length} 個任務，無失敗。`);
        }
      }
    }
  }

  console.log(`\n[backfill-precise] 全部完成，總失敗 ${totalFailures} 筆。`);
  if (totalFailures > 0) process.exitCode = 1;
};

main()
  .catch((error) => {
    console.error('精準回補腳本執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectAllDbs();
  });
