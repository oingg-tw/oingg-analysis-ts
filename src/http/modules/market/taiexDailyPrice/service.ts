import { listLatestTaiexDailyPrices } from '@/infrastructure/repositories/twse/taiexIndex';
import type { TaiexDailyPriceEntry, TaiexDailyPriceResult } from './types';

const toNullableNumber = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));

// 2026-09-14 web-nuxt 轉達使用者需求：Beta 卡片要加「公司股價 vs 大盤」對照走勢圖，
// 需要大盤加權指數的逐日收盤序列。export.daily_taiex_index 本來就是 computeBetaPit.ts
// 算 Beta 用的同一張表（見 computeBetaPit.ts 的市場報酬率基準），這裡直接查詢同一張表
// 開放出來，不做任何額外加工——回應形狀比照既有 daily-price-history（tradeDate+close，
// 舊到新排序），只是沒有 symbol（大盤只有一條序列）也沒有 OHLV（大盤沒有適用場景）。
export const getTaiexDailyPrice = async (limit: number): Promise<TaiexDailyPriceResult> => {
  const rows = await listLatestTaiexDailyPrices(limit);

  const entries: TaiexDailyPriceEntry[] = rows
    .map((row) => ({
      tradeDate: row.trade_date.toISOString().slice(0, 10),
      close: toNullableNumber(row.close),
    }))
    .reverse();

  return { entries };
};
