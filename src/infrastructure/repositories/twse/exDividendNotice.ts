import { twseExportPrisma } from '@/infrastructure/prisma/twseExportClient';
import type { ExDividendCalendarEntry, ExDividendNoticeEntry } from '@/application/ports/marketData';

// 上市股票/ETF 除權除息預告——2026-09-04 twse-ts 新開的 export.ex_dividend_notice view
// （來源：TWSE TWT48U_ALL），109 筆，只有上市（TWSE）有，TPEx 沒有對應資料源。
//
// 實測確認：symbol 不只有一般股票，也有 ETF（例如 00939、00984D），不是只有「上市股票」；
// ex_type 只有三種值：'息'（純除息）、'權'（純除權）、'權息'（合併發放）——是同一筆事件
// 用這個欄位標示類型，不是除權/除息各自分開一筆。純除息時權證相關欄位（stockDividendRatio
// 等）是 null，只有 cashDividend 有值。這張表是純原始公告資料，沒有還原參考價這類衍生欄位，
// 呼叫端要自己拿 exDate 對 daily_price 算除權息參考價/調整報酬率。
// entry 型別 2026-09-17 Phase 4 搬到 application/ports/marketData.ts（對外回應的 zod schema 在
// http/modules/stocks/types.ts），這裡 re-export 給既有 import 路徑。
export type { ExDividendNoticeEntry, ExDividendCalendarEntry };

// Postgres 的 numeric 欄位透過 $queryRaw 回來是字串（node-postgres 預設不轉成 JS number，
// 避免大數字精度問題），不是 number——之前 evEbitda/marketRatios 這些既有指標都是這樣處理，
// 這裡宣告成 string 才符合實際跑起來的型別，下面組 entry 時要手動 Number() 轉換。
interface RawExDividendNoticeRow {
  symbol: string;
  ex_date: Date;
  ex_type: string;
  stock_dividend_ratio: string | null;
  subscription_ratio: string | null;
  subscription_price_per_share: string | null;
  cash_dividend: string | null;
  shares_offered: string | null;
  shares_emp_owner: string | null;
  sharesholder_owner: string | null;
  stock_holding_ratio: string | null;
}

// 給個股頁面「下次除權息」提示、跟觀察清單「近期除權息」卡片用。只回傳「今天（含）以後」
// 的預告事件——這張表本身可能還留著剛過去幾天的紀錄，不是自動只存未來的，呼叫端要的是
// 「接下來要發生的事」不是「歷史紀錄」，所以這裡篩掉過去日期，不是原封不動照搬整張表。
// 查不到的 symbol 直接不會出現在回傳的 map 裡（跟 getStockPrices 同一種慣例），不是空陣列。
export const getUpcomingExDividendNotices = async (symbols: string[]): Promise<Record<string, ExDividendNoticeEntry[]>> => {
  const rows = await twseExportPrisma.$queryRaw<RawExDividendNoticeRow[]>`
    SELECT symbol, ex_date, ex_type, stock_dividend_ratio, subscription_ratio, subscription_price_per_share,
      cash_dividend, shares_offered, shares_emp_owner, sharesholder_owner, stock_holding_ratio
    FROM "export"."ex_dividend_notice"
    WHERE symbol = ANY(${symbols}) AND ex_date >= CURRENT_DATE
    ORDER BY ex_date ASC
  `;

  const toNumber = (value: string | null): number | null => (value === null ? null : Number(value));

  const result: Record<string, ExDividendNoticeEntry[]> = {};
  for (const row of rows) {
    const entry: ExDividendNoticeEntry = {
      exDate: row.ex_date.toISOString().slice(0, 10),
      exType: row.ex_type as ExDividendNoticeEntry['exType'],
      stockDividendRatio: toNumber(row.stock_dividend_ratio),
      subscriptionRatio: toNumber(row.subscription_ratio),
      subscriptionPricePerShare: toNumber(row.subscription_price_per_share),
      cashDividend: toNumber(row.cash_dividend),
      sharesOffered: toNumber(row.shares_offered),
      sharesEmpOwner: toNumber(row.shares_emp_owner),
      sharesholderOwner: toNumber(row.sharesholder_owner),
      stockHoldingRatio: toNumber(row.stock_holding_ratio),
    };
    (result[row.symbol] ??= []).push(entry);
  }
  return result;
};

// 2026-09-10 web-nuxt 轉達使用者需求：全市場除權息日曆（月曆格狀呈現，不是針對某個
// 使用者的觀察清單），既有的 getUpcomingExDividendNotices 要求先給 symbols 清單，
// 無法回答「這個月全市場會發生什麼事」——這支不帶 symbol 篩選，直接查整個時間區間。
// 不篩「只看未來」（跟 getUpcomingExDividendNotices 不同）——月曆情境本身就是呼叫端
// 自己決定要看哪個月，可能是本月已經過去一半的事件，也是合理的查詢。
export const getExDividendCalendar = async (startDate: Date, endDate: Date): Promise<ExDividendCalendarEntry[]> => {
  const rows = await twseExportPrisma.$queryRaw<RawExDividendNoticeRow[]>`
    SELECT symbol, ex_date, ex_type, stock_dividend_ratio, subscription_ratio, subscription_price_per_share,
      cash_dividend, shares_offered, shares_emp_owner, sharesholder_owner, stock_holding_ratio
    FROM "export"."ex_dividend_notice"
    WHERE ex_date >= ${startDate} AND ex_date <= ${endDate}
    ORDER BY ex_date ASC, symbol ASC
  `;

  const toNumber = (value: string | null): number | null => (value === null ? null : Number(value));

  return rows.map((row) => ({
    symbol: row.symbol,
    status: 'announced' as const,
    paymentDate: null,
    fiscalYear: null,
    exDate: row.ex_date.toISOString().slice(0, 10),
    exType: row.ex_type as ExDividendNoticeEntry['exType'],
    stockDividendRatio: toNumber(row.stock_dividend_ratio),
    subscriptionRatio: toNumber(row.subscription_ratio),
    subscriptionPricePerShare: toNumber(row.subscription_price_per_share),
    cashDividend: toNumber(row.cash_dividend),
    sharesOffered: toNumber(row.shares_offered),
    sharesEmpOwner: toNumber(row.shares_emp_owner),
    sharesholderOwner: toNumber(row.sharesholder_owner),
    stockHoldingRatio: toNumber(row.stock_holding_ratio),
  }));
};
