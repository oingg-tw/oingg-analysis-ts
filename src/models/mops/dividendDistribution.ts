// mops-ts export schema 底下股利分派公告表的即時查詢層——`export.dividend_distribution`
// （來源 MOPS t108sb27，見 mops-ts 的 DividendDistribution domain）。2026-09-15 查證：
// 已修好全市場回補的 CLI 續傳機制、也已開通這張 export view，但全市場 backfill 還沒真的
// 執行（排在 mops-ts 現行 financialReportXbrl 批次後面），目前覆蓋 212 家公司/569 筆
// （比 2026-09-09 查證時的 393筆/53家進步很多，可能是個別公司查詢陸續觸發累積的，不是
// 官方全市場批次跑過）。跟 bankRegulatoryXbrl.ts 同一種 $queryRawUnsafe 寫法。
//
// 每一列代表「一次董事會/股東會決議通過的股利分派案」，不是「這家公司的配息頻率」這種
// 固定屬性——同一家公司歷史上可能今年配一次、明年配四次，沒有欄位直接告訴你頻率，只能
// 從歷史紀錄反推（見 dividendDistributionCount 指標的說明）。fiscal_quarter 只有季配
// 公司才有值，年配公司這欄是 null（不代表資料缺漏，是那次分派案本來就沒有對應到特定季度）。

import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';

export interface DividendDistributionEvent {
  exDividendDate: Date;
  announcementDate: Date | null;
  rocFiscalYear: number;
}

interface RawDividendDistributionRow {
  ex_dividend_date: Date | null;
  announcement_date: Date | null;
  fiscal_year: number;
}

// 一次撈這家公司全部歷史分派紀錄（單一公司列數很小，目前實測最多 30 筆，不需要分頁），
// 依 ex_dividend_date 由新到舊排序，方便呼叫端直接取第一筆當最新基準日。
// ex_dividend_date 為 null 的列（理論上不該發生，董事會決議通過後才會有這筆紀錄，除息日
// 應該一定會有）直接濾掉，防禦性處理。
export const getDividendDistributionEvents = async (symbol: string): Promise<DividendDistributionEvent[]> => {
  const rows = await mopsExportPrisma.$queryRawUnsafe<RawDividendDistributionRow[]>(
    `SELECT ex_dividend_date, announcement_date, fiscal_year
     FROM "export"."dividend_distribution"
     WHERE symbol = $1
     ORDER BY ex_dividend_date DESC`,
    symbol
  );
  return rows
    .filter((r): r is RawDividendDistributionRow & { ex_dividend_date: Date } => r.ex_dividend_date !== null)
    .map((r) => ({ exDividendDate: r.ex_dividend_date, announcementDate: r.announcement_date, rocFiscalYear: r.fiscal_year }));
};

// 全市場目前有分派紀錄的公司清單——backfill 腳本用，不是逐一公司查詢用（那個用上面
// getDividendDistributionEvents 就夠）。隨 mops-ts 陸續回補會自然變多，這裡不寫死清單。
export const getSymbolsWithDividendDistribution = async (): Promise<string[]> => {
  const rows = await mopsExportPrisma.$queryRaw<{ symbol: string }[]>`
    SELECT DISTINCT symbol FROM "export"."dividend_distribution" ORDER BY symbol
  `;
  return rows.map((r) => r.symbol);
};
