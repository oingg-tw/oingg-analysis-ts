import { twseExportPrisma } from '@/infrastructure/prisma/twseExportClient';
import { tpexExportPrisma } from '@/infrastructure/prisma/tpexExportClient';
import type { ForeignShareholdingEntry } from '@/application/ports/marketData';

// 2026-09-08 twse-ts 新建的 export.foreign_shareholding view——全市場個股層級外資/陸資
// 持股統計（來源 TWSE MI_QFIIS 端點，selectType=ALLBUT0999），取代已退役的
// export.foreign_holding（那個只有前20名排行，這個是逐檔統計）。目前只回填了 2330 一檔
// （2021-09-07~2026-09-07），其他上市 symbol 查詢會回傳空陣列，不是錯誤——這是覆蓋率限制
// （2026-10-07 twse-ts：不會用舊端點補全市場）。上櫃見下方 getForeignShareholdingHistory。
//
// 只挑「shares_held_percent」（持股比例）跟「foreign_limit_percent」（法定持股上限，
// 用來算利用率：shares_held_percent / foreign_limit_percent）這兩個個股頁面卡片實際
// 會用到的欄位，加上 availableInvestPercent（尚可投資比例，三者是同一組資料的三個面向，
// 一起帶不多花成本）——不帶 name/isinCode/issuedShares/availableShares/sharesHeld/
// chinaLimitPercent/changeReason/lastReportDate 這些欄位，個股頁面已經有公司名稱等
// 基本資料來源，不需要這裡重複給。
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
// 這裡維持跟其他「取最近 N 筆」端點（例如 GET /companies/metric-history）一致的慣例，
// 不在查詢層先反轉。
// 2026-10-07 加上櫃：tpex-ts 開了同名 view（10-07 起每個交易日、約 888 檔、沒有歷史；欄位名照 twse-ts，但少 isin_code 等幾欄、
// 多 note，所以只挑明確欄位）。兩個 export 庫是不同資料庫不能 UNION，各查 limit 筆再合併；轉板公司同一天兩邊都有列時上市優先。
// 上市目前仍只有 2330（twse-ts 不用舊端點補全市場）。
const queryForeignShareholding = (db: typeof twseExportPrisma | typeof tpexExportPrisma, symbol: string, limit: number) =>
  db.$queryRaw<RawForeignShareholdingRow[]>`
    SELECT trade_date, shares_held_percent, foreign_limit_percent, available_invest_percent
    FROM "export"."foreign_shareholding"
    WHERE symbol = ${symbol}
    ORDER BY trade_date DESC
    LIMIT ${limit}
  `;

export const getForeignShareholdingHistory = async (symbol: string, limit: number): Promise<ForeignShareholdingEntry[]> => {
  const [listed, otc] = await Promise.all([queryForeignShareholding(twseExportPrisma, symbol, limit), queryForeignShareholding(tpexExportPrisma, symbol, limit)]);
  const seen = new Set<number>();
  const rows = [...listed, ...otc]
    .filter((row) => !seen.has(row.trade_date.getTime()) && seen.add(row.trade_date.getTime()))
    .sort((a, b) => b.trade_date.getTime() - a.trade_date.getTime())
    .slice(0, limit);
  return rows.map((row) => ({
    tradeDate: row.trade_date.toISOString().slice(0, 10),
    sharesHeldPercent: toNullableNumber(row.shares_held_percent),
    foreignLimitPercent: toNullableNumber(row.foreign_limit_percent),
    availableInvestPercent: toNullableNumber(row.available_invest_percent),
  }));
};
