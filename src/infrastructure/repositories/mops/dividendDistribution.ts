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

import { mopsExportPrisma } from '@/infrastructure/prisma/mopsExportClient';

import type { DividendDistributionEvent, DividendDistributionRow, DividendEventsPort, RealizedExDividendRow } from '@/application/ports/dividendEvents';

// DividendDistributionEvent 2026-09-17 Phase 3 搬到 application/ports/dividendEvents.ts（port 的 DTO），這裡 re-export 給既有 import 路徑。
export type { DividendDistributionEvent };

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

// 2026-09-19 歷年股利表用：完整欄位版本。numeric 欄位透過 $queryRaw 回來是 Decimal/字串，這裡統一
// Number()（null 保留），呼叫端拿到的是元／股的原生數字；日期欄位是 date 型別、Prisma 給 Date。
// 跟上面 getDividendDistributionEvents 刻意分開兩支：那支是指標核心（dividendDistributionCount）在用、
// 已被 cassette 錄下，不要為了多讀幾個欄位動它的回傳形狀。
interface RawDividendDistributionFullRow {
  fiscal_year: number;
  fiscal_quarter: number | null;
  cash_dividend_from_earnings: unknown;
  cash_dividend_from_capital_reserve: unknown;
  stock_dividend_from_earnings: unknown;
  stock_dividend_from_capital_reserve: unknown;
  ex_dividend_date: Date | null;
  ex_rights_date: Date | null;
  cash_dividend_payment_date: Date | null;
  announcement_date: Date | null;
}

const toNumberOrNull = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));

export const listDividendDistributionRows = async (symbol: string): Promise<DividendDistributionRow[]> => {
  const rows = await mopsExportPrisma.$queryRawUnsafe<RawDividendDistributionFullRow[]>(
    `SELECT fiscal_year, fiscal_quarter, cash_dividend_from_earnings, cash_dividend_from_capital_reserve,
            stock_dividend_from_earnings, stock_dividend_from_capital_reserve,
            ex_dividend_date, ex_rights_date, cash_dividend_payment_date, announcement_date
     FROM "export"."dividend_distribution"
     WHERE symbol = $1
     ORDER BY fiscal_year ASC, fiscal_quarter ASC NULLS FIRST, ex_dividend_date ASC NULLS LAST`,
    symbol
  );
  return rows.map((r) => ({
    rocFiscalYear: r.fiscal_year,
    fiscalQuarter: r.fiscal_quarter,
    cashDividendFromEarnings: toNumberOrNull(r.cash_dividend_from_earnings),
    cashDividendFromLegalReserveAndCapitalSurplus: toNumberOrNull(r.cash_dividend_from_capital_reserve),
    stockDividendFromEarnings: toNumberOrNull(r.stock_dividend_from_earnings),
    stockDividendFromLegalReserveAndCapitalSurplus: toNumberOrNull(r.stock_dividend_from_capital_reserve),
    exDividendDate: r.ex_dividend_date,
    exRightsDate: r.ex_rights_date,
    cashDividendPaymentDate: r.cash_dividend_payment_date,
    announcementDate: r.announcement_date,
  }));
};

// 2026-09-22 除權息月曆往回翻：LEAST() 在 Postgres 會忽略 NULL，所以「除息日／除權日只有一個」的列也能落在區間內；
// 兩個都 NULL 的列（只有股東會決議、還沒訂日期）自然不會被選到。
export const listRealizedExDividendRows = async (startDate: Date, endDate: Date): Promise<RealizedExDividendRow[]> => {
  const rows = await mopsExportPrisma.$queryRaw<(RawDividendDistributionFullRow & { symbol: string; company_name: string | null; ex_date: Date; par_value: unknown })[]>`
    SELECT symbol, company_name, fiscal_year, fiscal_quarter, cash_dividend_from_earnings, cash_dividend_from_capital_reserve,
           stock_dividend_from_earnings, stock_dividend_from_capital_reserve,
           ex_dividend_date, ex_rights_date, cash_dividend_payment_date, announcement_date, par_value,
           LEAST(ex_dividend_date, ex_rights_date) AS ex_date
    FROM "export"."dividend_distribution"
    WHERE LEAST(ex_dividend_date, ex_rights_date) BETWEEN ${startDate} AND ${endDate}
    ORDER BY ex_date ASC, symbol ASC`;
  return rows.map((r) => ({
    symbol: r.symbol,
    companyName: r.company_name,
    exDate: r.ex_date,
    parValue: toNumberOrNull(r.par_value),
    rocFiscalYear: r.fiscal_year,
    fiscalQuarter: r.fiscal_quarter,
    cashDividendFromEarnings: toNumberOrNull(r.cash_dividend_from_earnings),
    cashDividendFromLegalReserveAndCapitalSurplus: toNumberOrNull(r.cash_dividend_from_capital_reserve),
    stockDividendFromEarnings: toNumberOrNull(r.stock_dividend_from_earnings),
    stockDividendFromLegalReserveAndCapitalSurplus: toNumberOrNull(r.stock_dividend_from_capital_reserve),
    exDividendDate: r.ex_dividend_date,
    exRightsDate: r.ex_rights_date,
    cashDividendPaymentDate: r.cash_dividend_payment_date,
    announcementDate: r.announcement_date,
  }));
};

export const mopsDividendEvents: DividendEventsPort = { getDividendDistributionEvents, listDividendDistributionRows, listRealizedExDividendRows };
