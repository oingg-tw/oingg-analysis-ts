import type { AppDeps } from '@/application/deps';
import type { TaiexInterval } from '@/application/ports/taiexIndex';
import type { TaiexDailyPriceEntry, TaiexDailyPriceResult } from './types';

// 2026-09-17 Phase 4：從 http/modules/market/taiexDailyPrice/service.ts 搬來，查詢改走 deps.taiexIndex，邏輯逐字不變。
export type TaiexDailyPriceDeps = Pick<AppDeps, 'taiexIndex'>;

const toNullableNumber = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));

// 2026-09-14 web-nuxt 轉達使用者需求：Beta 卡片要加「公司股價 vs 大盤」對照走勢圖，
// 需要大盤加權指數的逐日收盤序列。export.daily_taiex_index 本來就是 computeBetaPit.ts
// 算 Beta 用的同一張表（見 computeBetaPit.ts 的市場報酬率基準），這裡直接查詢同一張表
// 開放出來，不做任何額外加工——回應形狀比照既有 daily-price-history（tradeDate+close，
// 舊到新排序），只是沒有 symbol（大盤只有一條序列）也沒有 OHLV（大盤沒有適用場景）。
// 2026-09-21 加 interval（weekly/monthly 取每區間最後一個交易日）：web-nuxt 要疊 1999 年起的央行升降息事件，
// 2000 筆上限維持不變，用粒度換深度（monthly 全歷史約 330 筆、weekly 約 1,400 筆）。
export const getTaiexDailyPrice = async (limit: number, interval: TaiexInterval, deps: TaiexDailyPriceDeps): Promise<TaiexDailyPriceResult> => {
  const rows = await deps.taiexIndex.listLatestTaiexDailyPrices(limit, interval);

  const entries: TaiexDailyPriceEntry[] = rows
    .map((row) => ({
      tradeDate: row.trade_date.toISOString().slice(0, 10),
      close: toNullableNumber(row.close),
    }))
    .reverse();

  return { entries };
};
