// 2026-09-13 使用者要求：能不能掃描空缺欄位再精準回補，不要每次都對全市場全指標重跑一遍。
// 這支腳本只負責「掃描」——找出哪些 (季度, 公司) 組合裡，GENERAL_METRIC_CODES/
// BANK_METRIC_CODES 至少有一支指標是「空缺」，寫成報告檔給 backfillMetricGapsPit.ts
// 讀取執行，兩支腳本刻意分開（掃描跟寫入分離，掃描可以隨時重跑檢查現況，不會誤觸寫入）。
//
// 空缺定義（使用者拍板）：
//   (1) 從來沒寫進 metric_values（該公司該季完全查不到這個 metricCode 的任何一筆）
//   (2) 有寫入但 value 全部是 null，且至少一筆 nullReason 是 missing_input 或
//       insufficient_history——這兩種原因有可能隨著上游資料源持續回填而自己解決，
//       值得重跑；not_applicable_industry（產業排除）/zero_or_negative_denominator
//       （分母為零或負）是結構性、重跑不會改變，不算空缺。
//
// 重要警告：insufficient_history 在「歷史最早幾季」通常是永久性的，不是暫時的——
// 例如 TTM 型指標在 113Q1（回填起點）本來就沒有再往前 3 季的資料可以湊出近四季，
// 這種 insufficient_history 重跑一百次都不會變成有值，因為資料源本身不會生出
// 113 年以前不存在的申報。這支腳本仍然會把它們算進「空缺」（照使用者要求的定義），
// 但輸出報告會按季度分組呈現數量，讓使用者自己判斷要不要真的對最早幾季的
// insufficient_history 觸發重跑（大機率是做白工）。
//
// 精準回補的粒度是「(公司, 季度)」不是「單一 metricCode」——GENERAL_METRIC_CODES 裡
// 有很多 metricCode 其實共用同一支 compute*Family*Pit（例如 dupont 家族一次寫 5 個
// metricCode），沒辦法只重算其中一個不動其他兄弟。只要一家公司在某一季有任何一支
// metricCode 空缺，就把整個 (公司, 季度) 標記為需要重跑 buildGeneralTasks/
// buildBankTasks 全部指標——這些指標本來就是一次查詢批次寫入，重算沒空缺的兄弟指標
// 不會產生錯誤結果（upsert 冪等），只是多花一點點運算，換來邏輯簡單可靠。
//
// 用法：pnpm tsx scripts/scanMetricGapsPit.ts

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { GENERAL_METRIC_CODES, BANK_METRIC_CODES } from './backfillTaskDefinitions';
import type { Season } from '../src/domain/calendar/rocQuarter';
import { backfillUniverse, analysisQueries } from '../src/bootstrap/scripts';
import { disconnectAllDbs } from '../src/bootstrap/db';

// 逐日型指標沒有「這一季」的概念，指定 quarter 回填時本來就會跳過（見
// backfillTaskDefinitions.ts buildGeneralTasks 的說明），這裡也排除，不然會被誤判成
// 「每一季都空缺」。
const DAILY_CADENCE_CODES = new Set(['beta', 'exchangePeRatio', 'exchangePbRatio', 'dividendYield']);
const GENERAL_QUARTERLY_CODES = GENERAL_METRIC_CODES.filter((c) => !DAILY_CADENCE_CODES.has(c));

const RETRYABLE_NULL_REASONS = new Set(['missing_input', 'insufficient_history']);

const QUARTERS: { year: string; season: Season; fiscalYear: number }[] = [
  { year: '113', season: '1', fiscalYear: 2024 }, { year: '113', season: '2', fiscalYear: 2024 },
  { year: '113', season: '3', fiscalYear: 2024 }, { year: '113', season: '4', fiscalYear: 2024 },
  { year: '114', season: '1', fiscalYear: 2025 }, { year: '114', season: '2', fiscalYear: 2025 },
  { year: '114', season: '3', fiscalYear: 2025 }, { year: '114', season: '4', fiscalYear: 2025 },
  { year: '115', season: '1', fiscalYear: 2026 }, { year: '115', season: '2', fiscalYear: 2026 },
];

const getGeneralSymbolsForQuarter = async (year: string, season: Season): Promise<string[]> => {
  const rows = await backfillUniverse.listSymbolsWithIncomeStatement(year, season);
  return rows.map((r) => r.symbol);
};

const getBankSymbolsForQuarter = async (year: string, season: Season): Promise<string[]> => {
  const rows = await backfillUniverse.listBankSymbolsForQuarter(year, season);
  return rows.map((r) => r.symbol);
};

interface GapReportEntry {
  general: string[];
  bank: string[];
}

// 找出「這一季、這批 metricCode 清單」裡，哪些公司至少有一支指標空缺。回傳空缺公司清單
// + 診斷用的「哪些 metricCode 造成最多空缺」統計。
const findGapSymbols = async (
  fiscalYear: number,
  fiscalQuarter: number,
  expectedSymbols: string[],
  metricCodes: string[]
): Promise<{ gapSymbols: string[]; gapCountByMetric: Record<string, number> }> => {
  const rows = await analysisQueries.listMetricValuesForGapScan({ metricCodes, fiscalYear, fiscalQuarter, symbols: expectedSymbols });

  // symbol -> metricCode -> 是否至少有一筆非 null 值 / 是否至少有一筆可重試的 null 原因
  const bySymbol = new Map<string, Map<string, { hasValue: boolean; hasRetryableNull: boolean }>>();
  for (const row of rows) {
    if (!bySymbol.has(row.symbol)) bySymbol.set(row.symbol, new Map());
    const metricMap = bySymbol.get(row.symbol)!;
    const existing = metricMap.get(row.metricCode) ?? { hasValue: false, hasRetryableNull: false };
    if (row.value !== null) existing.hasValue = true;
    else if (row.nullReason && RETRYABLE_NULL_REASONS.has(row.nullReason)) existing.hasRetryableNull = true;
    metricMap.set(row.metricCode, existing);
  }

  const gapSymbols: string[] = [];
  const gapCountByMetric: Record<string, number> = {};

  for (const symbol of expectedSymbols) {
    const metricMap = bySymbol.get(symbol);
    let symbolHasGap = false;
    for (const metricCode of metricCodes) {
      const entry = metricMap?.get(metricCode);
      const isGap = !entry || (!entry.hasValue && entry.hasRetryableNull);
      if (isGap) {
        symbolHasGap = true;
        gapCountByMetric[metricCode] = (gapCountByMetric[metricCode] ?? 0) + 1;
      }
    }
    if (symbolHasGap) gapSymbols.push(symbol);
  }

  return { gapSymbols, gapCountByMetric };
};

const main = async () => {
  const report: Record<string, GapReportEntry> = {};
  const overallGeneralGapByMetric: Record<string, number> = {};
  const overallBankGapByMetric: Record<string, number> = {};

  for (const { year, season, fiscalYear } of QUARTERS) {
    const seasonNum = Number(season);
    console.log(`\n[scan-gaps] ===== ${year}Q${season} =====`);

    const [generalSymbols, bankSymbols] = await Promise.all([
      getGeneralSymbolsForQuarter(year, season),
      getBankSymbolsForQuarter(year, season),
    ]);

    const { gapSymbols: generalGaps, gapCountByMetric: generalGapCount } = await findGapSymbols(
      fiscalYear,
      seasonNum,
      generalSymbols,
      GENERAL_QUARTERLY_CODES
    );
    const { gapSymbols: bankGaps, gapCountByMetric: bankGapCount } = await findGapSymbols(
      fiscalYear,
      seasonNum,
      bankSymbols,
      BANK_METRIC_CODES
    );

    for (const [code, count] of Object.entries(generalGapCount)) overallGeneralGapByMetric[code] = (overallGeneralGapByMetric[code] ?? 0) + count;
    for (const [code, count] of Object.entries(bankGapCount)) overallBankGapByMetric[code] = (overallBankGapByMetric[code] ?? 0) + count;

    console.log(
      `[scan-gaps] ${year}Q${season}：一般 ${generalGaps.length}/${generalSymbols.length} 家有空缺，銀行 ${bankGaps.length}/${bankSymbols.length} 家有空缺`
    );
    const topGeneral = Object.entries(generalGapCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (topGeneral.length > 0) {
      console.log(`[scan-gaps] ${year}Q${season} 空缺最多的指標：${topGeneral.map(([c, n]) => `${c}(${n})`).join(', ')}`);
    }

    report[`${year}Q${season}`] = { general: generalGaps, bank: bankGaps };
  }

  mkdirSync(join(process.cwd(), 'tmp'), { recursive: true });
  const reportPath = join(process.cwd(), 'tmp', 'metric-gaps-report.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  const totalGeneral = Object.values(report).reduce((sum, r) => sum + r.general.length, 0);
  const totalBank = Object.values(report).reduce((sum, r) => sum + r.bank.length, 0);
  console.log(`\n[scan-gaps] 掃描完成，報告寫入 ${reportPath}`);
  console.log(`[scan-gaps] 總計：一般指標 ${totalGeneral} 個 (公司,季度) 組合有空缺，銀行監理指標 ${totalBank} 個組合有空缺`);
  console.log(
    `[scan-gaps] 全期間空缺最多的一般指標（前 10）：${Object.entries(overallGeneralGapByMetric)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([c, n]) => `${c}(${n})`)
      .join(', ')}`
  );
  if (Object.keys(overallBankGapByMetric).length > 0) {
    console.log(
      `[scan-gaps] 全期間空缺的銀行指標：${Object.entries(overallBankGapByMetric)
        .sort((a, b) => b[1] - a[1])
        .map(([c, n]) => `${c}(${n})`)
        .join(', ')}`
    );
  }
};

main()
  .catch((error) => {
    console.error('掃描空缺腳本執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectAllDbs();
  });
