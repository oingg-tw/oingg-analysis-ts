import { exportView } from '@/infrastructure/repositories/exchange/exportViews';
import { twseExportPrisma } from '@/infrastructure/prisma/twseExportClient';
import { tpexExportPrisma } from '@/infrastructure/prisma/tpexExportClient';
import type { DailyCloseRow } from '@/application/ports/marketData';

// Beta 計算用的個股/大盤收盤價序列（export.daily_price / export.daily_taiex_index）——2026-09-17
// 重構 Phase 2 從 application/metrics/valuation/beta/computeBetaPit.ts 搬來的 raw SQL（逐字，
// 含「有指定 until 才加 <= 條件」的兩種變體），回傳原始列形狀（close 是 Decimal 物件）。
// 列型別 Phase 3 搬到 application/ports/marketData.ts 的 DailyCloseRow，這裡沿用舊名 re-export。
export type RawDailyCloseRow = DailyCloseRow;

// 個股自 since 起（含）依日期升冪的收盤價；until 有給就只取到 until（含）。
// 2026-09-30 修：原本只查上市（twseExportPrisma），上櫃公司查回空陣列 → beta 整批沒算、也不報錯（115Q2 實測 beta 只有
// 上市 1,082 家、上櫃 0 家）。改成上市＋上櫃都查再合併，跟下面 listClosesBothExchanges 同一個理由（轉板公司兩邊各一段）。
const queryClosesSince = (db: typeof twseExportPrisma | typeof tpexExportPrisma, symbol: string, since: Date, until?: Date) =>
  until
    ? db.$queryRaw<RawDailyCloseRow[]>`
        SELECT trade_date, NULLIF(close, 0) AS close FROM ${exportView(db, 'daily_price')}
        WHERE symbol = ${symbol} AND trade_date >= ${since} AND trade_date <= ${until}
        ORDER BY trade_date ASC
      `
    : db.$queryRaw<RawDailyCloseRow[]>`
        SELECT trade_date, NULLIF(close, 0) AS close FROM ${exportView(db, 'daily_price')}
        WHERE symbol = ${symbol} AND trade_date >= ${since}
        ORDER BY trade_date ASC
      `;

export const listDailyClosesSince = async (symbol: string, since: Date, until?: Date): Promise<RawDailyCloseRow[]> => {
  const [listed, otc] = await Promise.all([queryClosesSince(twseExportPrisma, symbol, since, until), queryClosesSince(tpexExportPrisma, symbol, since, until)]);
  return [...listed, ...otc].sort((a, b) => a.trade_date.getTime() - b.trade_date.getTime());
};

// 大盤加權指數自 since 起（含）依日期升冪的收盤點數；until 有給就只取到 until（含）。
export const listTaiexClosesSince = (since: Date, until?: Date): Promise<RawDailyCloseRow[]> =>
  until
    ? twseExportPrisma.$queryRaw<RawDailyCloseRow[]>`
        SELECT trade_date, close FROM ${exportView(twseExportPrisma, 'daily_taiex_index')}
        WHERE trade_date >= ${since} AND trade_date <= ${until}
        ORDER BY trade_date ASC
      `
    : twseExportPrisma.$queryRaw<RawDailyCloseRow[]>`
        SELECT trade_date, close FROM ${exportView(twseExportPrisma, 'daily_taiex_index')}
        WHERE trade_date >= ${since}
        ORDER BY trade_date ASC
      `;

// 這檔股票在 daily_price 最早的交易日（上市＋上櫃取較早；完全沒有股價資料回 null）。2026-09-30 同上，原本只查上市。
export const getEarliestTradeDate = async (symbol: string): Promise<Date | null> => {
  const query = (db: typeof twseExportPrisma | typeof tpexExportPrisma) =>
    db.$queryRaw<{ min_date: Date | null }[]>`SELECT MIN(trade_date) AS min_date FROM ${exportView(db, 'daily_price')} WHERE symbol = ${symbol}`;
  const dates = (await Promise.all([query(twseExportPrisma), query(tpexExportPrisma)])).map((r) => r[0]?.min_date ?? null).filter((d): d is Date => d !== null);
  return dates.length === 0 ? null : new Date(Math.min(...dates.map((d) => d.getTime())));
};

// 2026-09-26 面額換發偵測用（原在 twse/marketCap.ts，2026-09-27 股本規則 B 也要用，搬來共用）：上市＋上櫃合併、只取有成交的日子。
// 上市櫃轉板的公司兩邊各有一段（8476 2023-10 轉上市），合併起來才是完整序列。
const queryClosesBetween = (db: typeof twseExportPrisma | typeof tpexExportPrisma, symbol: string, since: Date, until: Date) =>
  db.$queryRaw<{ trade_date: Date; close: unknown }[]>`
    SELECT trade_date, close FROM ${exportView(db, 'daily_price')}
    WHERE symbol = ${symbol} AND trade_date >= ${since} AND trade_date <= ${until} AND close > 0
    ORDER BY trade_date ASC
  `;

export const listClosesBothExchanges = async (symbol: string, since: Date, until: Date): Promise<{ date: Date; close: number }[]> => {
  const [listed, otc] = await Promise.all([queryClosesBetween(twseExportPrisma, symbol, since, until), queryClosesBetween(tpexExportPrisma, symbol, since, until)]);
  return [...listed, ...otc].sort((a, b) => a.trade_date.getTime() - b.trade_date.getTime()).map((c) => ({ date: c.trade_date, close: Number(c.close) }));
};
