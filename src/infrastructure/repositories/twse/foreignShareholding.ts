import { tpexExportPrisma } from '@/infrastructure/prisma/tpexExportClient';
import type { ForeignShareholdingEntry } from '@/application/ports/marketData';

// 外資/陸資持股統計（export.foreign_shareholding）。2026-10-08 起**只查上櫃**：twse-ts 依使用者「OpenAPI 開放多少欄位，view 就開放多少欄位」
// 把上市的 view 拿掉（TWSE OpenAPI 只給每天持股比率前 20 名，表裡唯一的 2330 從來不在 OpenAPI 範圍內），上市公司一律回空陣列。
// 上櫃（tpex-ts，TPEx OpenAPI 開放全市場）2026-10-07 起每個交易日、約 888 檔，沒有更早的歷史。
// 檔案仍放在 twse/ 是歷史位置（2026-09-08 起先接上市），沒有搬家以免跟這次的行為變更混在同一個 commit。
//
// 只挑「shares_held_percent」（持股比例）、「foreign_limit_percent」（法定持股上限）、available_invest_percent（尚可投資比例）
// 這三個個股頁面卡片實際會用到的欄位；tpex 的 view 比 twse 少 isin_code 等幾欄、多 note，所以用明確欄位清單。
// entry 型別 2026-09-17 Phase 4 搬到 application/ports/marketData.ts（zod schema 在 http/modules/stocks/types.ts）。
export type { ForeignShareholdingEntry };

interface RawForeignShareholdingRow {
  trade_date: Date;
  shares_held_percent: unknown;
  foreign_limit_percent: unknown;
  available_invest_percent: unknown;
}

const toNullableNumber = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));

// 依日期新到舊排序，取最近 limit 筆——個股頁面畫時間序列圖表時通常會自己反轉成舊到新，
// 這裡維持跟其他「取最近 N 筆」端點（例如 GET /companies/metric-history）一致的慣例，不在查詢層先反轉。
export const getForeignShareholdingHistory = async (symbol: string, limit: number): Promise<ForeignShareholdingEntry[]> => {
  const rows = await tpexExportPrisma.$queryRaw<RawForeignShareholdingRow[]>`
    SELECT trade_date, shares_held_pct AS shares_held_percent, foreign_limit_pct AS foreign_limit_percent, available_invest_pct AS available_invest_percent -- 2026-10-11 改讀 tpex 新欄名
    FROM "export"."v_foreign_shareholdings"
    WHERE symbol = ${symbol}
    ORDER BY trade_date DESC
    LIMIT ${limit}
  `;
  return rows.map((row) => ({
    tradeDate: row.trade_date.toISOString().slice(0, 10),
    sharesHeldPct: toNullableNumber(row.shares_held_percent),
    foreignLimitPct: toNullableNumber(row.foreign_limit_percent),
    availableInvestPct: toNullableNumber(row.available_invest_percent),
  }));
};
