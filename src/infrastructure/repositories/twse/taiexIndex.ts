import { twseExportPrisma } from '@/infrastructure/prisma/twseExportClient';
import { Prisma } from '#generated/twse-export-client';
import type { TaiexIndexPort, TaiexInterval } from '@/application/ports/taiexIndex';

// 大盤加權指數（export.daily_taiex_index）——2026-09-17 重構 Phase 2 從 http/modules/market/
// taiexDailyPrice/service.ts 搬來的 raw SQL（逐字），回傳原始列形狀（close 是 Decimal 物件），
// 轉換維持在呼叫端。computeBetaPit.ts 算 Beta 用的是同一張表，之後（Phase 2 後段）它的查詢也會
// 收進這個模組。
export interface RawTaiexDailyPriceRow {
  trade_date: Date;
  close: unknown;
}

// 由新到舊取 limit 筆。weekly/monthly 用 DISTINCT ON 每個 date_trunc 區間取最後一個交易日（週一起算的 ISO 週、
// 日曆月）；interval 已被 zod enum 限制，Prisma.raw 只會收到這三個字面值。
const TRUNC_UNIT: Record<Exclude<TaiexInterval, 'daily'>, string> = { weekly: 'week', monthly: 'month' };
export const listLatestTaiexDailyPrices = (limit: number, interval: TaiexInterval): Promise<RawTaiexDailyPriceRow[]> => {
  if (interval === 'daily') {
    return twseExportPrisma.$queryRaw<RawTaiexDailyPriceRow[]>`
      SELECT trade_date, close FROM "export"."daily_taiex_index"
      ORDER BY trade_date DESC LIMIT ${limit}
    `;
  }
  const unit = Prisma.raw(`'${TRUNC_UNIT[interval]}'`);
  return twseExportPrisma.$queryRaw<RawTaiexDailyPriceRow[]>`
    SELECT DISTINCT ON (date_trunc(${unit}, trade_date)) trade_date, close FROM "export"."daily_taiex_index"
    ORDER BY date_trunc(${unit}, trade_date) DESC, trade_date DESC LIMIT ${limit}
  `;
};

// 全部歷史，依日期升冪（equityRiskPremium 取每月最後一個收盤價用）。
export const listAllTaiexDailyPricesAsc = (): Promise<RawTaiexDailyPriceRow[]> =>
  twseExportPrisma.$queryRaw<RawTaiexDailyPriceRow[]>`
    SELECT trade_date, close FROM "export"."daily_taiex_index" ORDER BY trade_date ASC
  `;

// application/ports/taiexIndex.ts 的實作——src/bootstrap/deps.ts 綁進 AppDeps。
export const twseTaiexIndex: TaiexIndexPort = { listLatestTaiexDailyPrices };
