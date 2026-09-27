import { twseExportPrisma } from '@/infrastructure/prisma/twseExportClient';
import { tpexExportPrisma } from '@/infrastructure/prisma/tpexExportClient';
import type { DailyCloseRow } from '@/application/ports/marketData';

// Beta 計算用的個股/大盤收盤價序列（export.daily_price / export.daily_taiex_index）——2026-09-17
// 重構 Phase 2 從 application/metrics/valuation/beta/computeBetaPit.ts 搬來的 raw SQL（逐字，
// 含「有指定 until 才加 <= 條件」的兩種變體），回傳原始列形狀（close 是 Decimal 物件）。
// 列型別 Phase 3 搬到 application/ports/marketData.ts 的 DailyCloseRow，這裡沿用舊名 re-export。
export type RawDailyCloseRow = DailyCloseRow;

// 個股自 since 起（含）依日期升冪的收盤價；until 有給就只取到 until（含）。
export const listDailyClosesSince = (symbol: string, since: Date, until?: Date): Promise<RawDailyCloseRow[]> =>
  until
    ? twseExportPrisma.$queryRaw<RawDailyCloseRow[]>`
        SELECT trade_date, close FROM "export"."daily_price"
        WHERE symbol = ${symbol} AND trade_date >= ${since} AND trade_date <= ${until}
        ORDER BY trade_date ASC
      `
    : twseExportPrisma.$queryRaw<RawDailyCloseRow[]>`
        SELECT trade_date, close FROM "export"."daily_price"
        WHERE symbol = ${symbol} AND trade_date >= ${since}
        ORDER BY trade_date ASC
      `;

// 大盤加權指數自 since 起（含）依日期升冪的收盤點數；until 有給就只取到 until（含）。
export const listTaiexClosesSince = (since: Date, until?: Date): Promise<RawDailyCloseRow[]> =>
  until
    ? twseExportPrisma.$queryRaw<RawDailyCloseRow[]>`
        SELECT trade_date, close FROM "export"."daily_taiex_index"
        WHERE trade_date >= ${since} AND trade_date <= ${until}
        ORDER BY trade_date ASC
      `
    : twseExportPrisma.$queryRaw<RawDailyCloseRow[]>`
        SELECT trade_date, close FROM "export"."daily_taiex_index"
        WHERE trade_date >= ${since}
        ORDER BY trade_date ASC
      `;

// 這檔股票在 daily_price 最早的交易日（完全沒有股價資料回 null）。
export const getEarliestTradeDate = async (symbol: string): Promise<Date | null> => {
  const rows = await twseExportPrisma.$queryRaw<{ min_date: Date | null }[]>`SELECT MIN(trade_date) AS min_date FROM "export"."daily_price" WHERE symbol = ${symbol}`;
  return rows[0]?.min_date ?? null;
};

// 2026-09-26 面額換發偵測用（原在 twse/marketCap.ts，2026-09-27 股本規則 B 也要用，搬來共用）：上市＋上櫃合併、只取有成交的日子。
// 上市櫃轉板的公司兩邊各有一段（8476 2023-10 轉上市），合併起來才是完整序列。
const queryClosesBetween = (db: typeof twseExportPrisma | typeof tpexExportPrisma, symbol: string, since: Date, until: Date) =>
  db.$queryRaw<{ trade_date: Date; close: unknown }[]>`
    SELECT trade_date, close FROM "export"."daily_price"
    WHERE symbol = ${symbol} AND trade_date >= ${since} AND trade_date <= ${until} AND close IS NOT NULL
    ORDER BY trade_date ASC
  `;

export const listClosesBothExchanges = async (symbol: string, since: Date, until: Date): Promise<{ date: Date; close: number }[]> => {
  const [listed, otc] = await Promise.all([queryClosesBetween(twseExportPrisma, symbol, since, until), queryClosesBetween(tpexExportPrisma, symbol, since, until)]);
  return [...listed, ...otc].sort((a, b) => a.trade_date.getTime() - b.trade_date.getTime()).map((c) => ({ date: c.trade_date, close: Number(c.close) }));
};
