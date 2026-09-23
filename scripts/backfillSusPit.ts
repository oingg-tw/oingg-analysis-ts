// SUS（標準化未預期營收）全市場回填——本專案第一支月頻指標，寫進 metric_monthly_values。
//
// 為什麼獨立一支腳本而不是併進 backfillTaskDefinitions：那套的任務單位是 (公司, 季度)，月頻對不上——
// 一家公司一季有三個月，硬塞會變成「一季只回填一個月」或「三個月互相覆蓋」。
//
// 用法：pnpm tsx scripts/backfillSusPit.ts
//   MONTHS        最多回填最近幾個月，預設 60（資料上限就是 60 個月）
//   CONCURRENCY   公司層級併發數，預設 8（DB 連線池 connection_limit=5，調高效益有限）
//   SYMBOL_LIMIT  只跑前 N 家，測試用
import 'dotenv/config';
import { computeAndWriteSusPit } from '../src/bootstrap/pitMetrics';
import { backfillUniverse, reportAvailability } from '../src/bootstrap/scripts';
import { memoizeMonthlyRevenueForBackfill } from '../src/bootstrap/memoizedStatements';
import { disconnectAllDbs } from '../src/bootstrap/db';

const CONCURRENCY = Number(process.env.CONCURRENCY ?? 8);
const MONTHS = Number(process.env.MONTHS ?? 60);

// 最近 N 個月的 "YYYY-MM"（由舊到新）。以「今天」為界往回推——實際算不出來的月份 compute 會回
// skipped_no_quarter（該公司沒有那個月的營收）或 insufficient_history（窗口不足 21 個月），不用先篩。
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
  const symbols = (await backfillUniverse.listSymbolsWithMonthlyRevenue()).map((r) => r.symbol).slice(0, Number(process.env.SYMBOL_LIMIT ?? Infinity));
  const months = recentMonths(MONTHS);
  console.log(`[sus-backfill] 公司 ${symbols.length} 家 × 月份 ${months.length} 個（${months[0]} ~ ${months.at(-1)}），併發 ${CONCURRENCY}`);

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
          const result = await computeAndWriteSusPit({ symbol, yearMonth, dataType, subsidiaryCompanyId: '' });
          const action = result.sus.action;
          outcomes[action] = (outcomes[action] ?? 0) + 1;
        }
      } catch (error) {
        failures++;
        console.error(`[sus-backfill] ${symbol} 失敗：`, error);
      }
      done++;
      if (done % 100 === 0) {
        const mins = (Date.now() - started) / 60000;
        console.log(`[sus-backfill] 進度 ${done}/${symbols.length} 已耗時 ${mins.toFixed(1)} 分鐘，預估剩餘 ${((mins / done) * (symbols.length - done)).toFixed(1)} 分鐘，錯誤 ${failures} 筆`);
      }
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`[sus-backfill] 完成 ${done}/${symbols.length}，錯誤 ${failures} 筆，總耗時 ${((Date.now() - started) / 60000).toFixed(1)} 分鐘`);
  console.log(`[sus-backfill] 寫入結果分布：${Object.entries(outcomes).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  await disconnectAllDbs();
})();
