import { pitDeps } from './pitDeps';

// 2026-09-22：回填腳本的瓶頸不是併發是**重複查詢**——同一家公司同一季，roe/roa/dupont/turnover/roic/roce…
// 每個 label 各自重抓一模一樣的 5 季資產負債表＋4 季損益表，Neon 往返被重複 5–7 倍（DB 連線池
// connection_limit=5，所以加 worker 沒用：16 個 worker 只比 8 個快 15%）。把三大表的讀取記憶化之後實測
// 每組 0.69 → 0.23 秒，全市場十季六個 label 從 4 小時降到 66 分。
//
// 只給**一次性跑完就結束**的回填/稽核腳本用，不給長駐的 HTTP server 用：快取沒有失效機制，上游改資料後
// 舊值會一直留著。跟 tests/fixtures/pit/capture.ts 同一招用 Object.assign 蓋回同一個 pitDeps 物件——
// bootstrap/pitMetrics.ts 綁好的 computeAndWriteXxxPit 拿的是同一個參照，所以綁定完才呼叫也有效。
//
// ponytail: 無上限的 Map，跑完整個 process 就結束所以不清。全市場十季約 2,335 家 × 10 季 × 3 表 ≈ 7 萬筆
// （每筆是一個 JSON 化的 key + 一個 Promise），實測幾十 MB。真的要跑到記憶體吃緊（例如全歷史 24 季 × 多批）
// 再換成 LRU 或按季度分批清。
const MEMOIZED_METHODS = ['getIncomeStatement', 'getBalanceSheet', 'getCashFlowStatement', 'getInsuranceIncomeStatement'] as const;

export const memoizeStatementsForBackfill = (): { size: () => number } => {
  const cache = new Map<string, Promise<unknown>>();
  const target = pitDeps.statements;
  const memoized = new Proxy(target, {
    get: (obj, prop, receiver) => {
      const original = Reflect.get(obj, prop, receiver);
      if (typeof original !== 'function' || typeof prop !== 'string' || !(MEMOIZED_METHODS as readonly string[]).includes(prop)) return original;
      return (...args: unknown[]) => {
        const key = `${prop}:${JSON.stringify(args)}`;
        let hit = cache.get(key);
        if (!hit) {
          hit = (original as (...a: unknown[]) => Promise<unknown>).apply(obj, args);
          cache.set(key, hit);
        }
        return hit;
      };
    },
  });
  Object.assign(pitDeps, { statements: memoized });
  return { size: () => cache.size };
};

// 2026-09-23 月頻回填（scripts/backfillSusPit.ts）用：同一家公司的 60 個月各自呼叫一次 computeSus，
// 每次都會重抓整份月營收歷史——記憶化之後一家公司只查一次。跟上面 memoizeStatementsForBackfill 同一招、
// 同樣只給一次性跑完就結束的腳本用（沒有失效機制）。
export const memoizeMonthlyRevenueForBackfill = (): { size: () => number } => {
  const cache = new Map<string, Promise<unknown>>();
  const target = pitDeps.monthlyRevenue;
  const memoized = new Proxy(target, {
    get: (obj, prop, receiver) => {
      const original = Reflect.get(obj, prop, receiver);
      if (typeof original !== 'function' || prop !== 'getMonthlyRevenueHistory') return original;
      return (...args: unknown[]) => {
        const key = JSON.stringify(args);
        let hit = cache.get(key);
        if (!hit) {
          hit = (original as (...a: unknown[]) => Promise<unknown>).apply(obj, args);
          cache.set(key, hit);
        }
        return hit;
      };
    },
  });
  Object.assign(pitDeps, { monthlyRevenue: memoized });
  return { size: () => cache.size };
};
