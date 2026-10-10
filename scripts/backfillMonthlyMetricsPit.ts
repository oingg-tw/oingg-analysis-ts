// 月頻指標全市場回填（sus、revenueYoy3m，清單在 src/bootstrap/pitMetrics.ts 的 MONTHLY_METRIC_PITS），寫進 metric_monthly_values。
// 2026-10-07 從 backfillSusPit.ts 改名泛化，並補上 upsertMetricDefinition（metric_monthly_values 對 metric_definitions 有 FK）。
//
// 為什麼獨立一支腳本而不是併進 backfillTaskDefinitions：那套的任務單位是 (公司, 季度)，月頻對不上——
// 一家公司一季有三個月，硬塞會變成「一季只回填一個月」或「三個月互相覆蓋」。
//
// 用法：pnpm tsx scripts/backfillMonthlyMetricsPit.ts
//   LABELS        逗號分隔的 metricCode，只跑這幾支（預設全部月頻指標）
//   MONTHS        最多回填最近幾個月，預設 132（2026-10-10 月營收延長到 2016-01 起，約 128 個月）
//   CONCURRENCY   公司層級併發數，預設 8（DB 連線池 connection_limit=5，調高效益有限）
//   SYMBOL_LIMIT  只跑前 N 家，測試用
import 'dotenv/config';
import { MONTHLY_METRIC_PITS } from '../src/bootstrap/pitMetrics';
import { metricDefinitionRegistry, upsertMetricDefinition } from '../src/bootstrap/metricDefinitions';
import { backfillUniverse, reportAvailability } from '../src/bootstrap/scripts';
import { memoizeMonthlyRevenueForBackfill } from '../src/bootstrap/memoizedStatements';
import { disconnectAllDbs } from '../src/bootstrap/db';

const CONCURRENCY = Number(process.env.CONCURRENCY ?? 8);
const MONTHS = Number(process.env.MONTHS ?? 132);
const LABELS = process.env.LABELS ? process.env.LABELS.split(',').map((l) => l.trim()) : Object.keys(MONTHLY_METRIC_PITS);
// 2026-10-11 只重跑指定公司（逗號分隔），例如前一輪失敗的那批；不給就跑全部。
const ONLY_SYMBOLS = process.env.SYMBOLS ? new Set(process.env.SYMBOLS.split(",").map((s) => s.trim())) : null;
const pits = Object.entries(MONTHLY_METRIC_PITS).filter(([code]) => LABELS.includes(code));

// 最近 N 個月的 "YYYY-MM"（由舊到新）。以「今天」為界往回推——實際算不出來的月份 compute 會回
// skipped_no_quarter（該公司沒有那個月的營收）或 insufficient_history（窗口不足：sus 21 個月、revenueYoy3m 15 個月），不用先篩。
const recentMonths = (n: number): string[] => {
  const now = new Date();
  const months: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return months;
};

void (async () => {
  memoizeMonthlyRevenueForBackfill();
  for (const [code] of pits) await upsertMetricDefinition(metricDefinitionRegistry[code]!);
  const symbols = (await backfillUniverse.listSymbolsWithMonthlyRevenue()).map((r) => r.symbol).filter((s) => !ONLY_SYMBOLS || ONLY_SYMBOLS.has(s)).slice(0, Number(process.env.SYMBOL_LIMIT ?? Infinity));
  const months = recentMonths(MONTHS);
  console.log(`[monthly-backfill] 指標 ${pits.map(([c]) => c).join(",")}、公司 ${symbols.length} 家 × 月份 ${months.length} 個（${months[0]} ~ ${months.at(-1)}），併發 ${CONCURRENCY}`);

  const started = Date.now();
  let done = 0;
  let failures = 0;
  const outcomes: Record<string, number> = {};
  let cursor = 0;

  const worker = async () => {
    while (cursor < symbols.length) {
      const symbol = symbols[cursor++]!;
      try {
        // 每家公司的財報口徑跟其他指標一致（見 application/ports/reportAvailability.ts），不寫死 '2'。
        const dataType = await reportAvailability.resolveDataType(symbol);
        for (const yearMonth of months) {
          for (const [code, run] of pits) {
            const result = await run({ symbol, yearMonth, dataType, subsidiaryCompanyId: '' });
            for (const slot of Object.values(result)) {
              const key = `${code}:${(slot as { action: string }).action}`;
              outcomes[key] = (outcomes[key] ?? 0) + 1;
            }
          }
        }
      } catch (error) {
        failures++;
        console.error(`[monthly-backfill] ${symbol} 失敗：`, error);
      }
      done++;
      if (done % 100 === 0) {
        const mins = (Date.now() - started) / 60000;
        console.log(`[monthly-backfill] 進度 ${done}/${symbols.length} 已耗時 ${mins.toFixed(1)} 分鐘，預估剩餘 ${((mins / done) * (symbols.length - done)).toFixed(1)} 分鐘，錯誤 ${failures} 筆`);
      }
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`[monthly-backfill] 完成 ${done}/${symbols.length}，錯誤 ${failures} 筆，總耗時 ${((Date.now() - started) / 60000).toFixed(1)} 分鐘`);
  console.log(`[monthly-backfill] 寫入結果分布：${Object.entries(outcomes).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  await disconnectAllDbs();
})();
