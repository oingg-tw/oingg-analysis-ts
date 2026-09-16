import { twseExportPrisma } from '@/infrastructure/prisma/twseExportClient';
import type { TaiexIndexPort } from '@/application/ports/taiexIndex';

// 大盤加權指數（export.daily_taiex_index）——2026-09-17 重構 Phase 2 從 http/modules/market/
// taiexDailyPrice/service.ts 搬來的 raw SQL（逐字），回傳原始列形狀（close 是 Decimal 物件），
// 轉換維持在呼叫端。computeBetaPit.ts 算 Beta 用的是同一張表，之後（Phase 2 後段）它的查詢也會
// 收進這個模組。
export interface RawTaiexDailyPriceRow {
  trade_date: Date;
  close: unknown;
}

// 由新到舊取 limit 筆。
export const listLatestTaiexDailyPrices = (limit: number): Promise<RawTaiexDailyPriceRow[]> =>
  twseExportPrisma.$queryRaw<RawTaiexDailyPriceRow[]>`
    SELECT trade_date, close FROM "export"."daily_taiex_index"
    ORDER BY trade_date DESC LIMIT ${limit}
  `;

// 全部歷史，依日期升冪（equityRiskPremium 取每月最後一個收盤價用）。
export const listAllTaiexDailyPricesAsc = (): Promise<RawTaiexDailyPriceRow[]> =>
  twseExportPrisma.$queryRaw<RawTaiexDailyPriceRow[]>`
    SELECT trade_date, close FROM "export"."daily_taiex_index" ORDER BY trade_date ASC
  `;

// application/ports/taiexIndex.ts 的實作——src/bootstrap/deps.ts 綁進 AppDeps。
export const twseTaiexIndex: TaiexIndexPort = { listLatestTaiexDailyPrices };
