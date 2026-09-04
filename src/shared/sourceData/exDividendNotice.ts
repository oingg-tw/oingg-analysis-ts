import { twseExportPrisma } from '@/adapters/prisma/twseExportClient';

// 上市股票/ETF 除權除息預告——2026-09-04 twse-ts 新開的 export.ex_dividend_notice view
// （來源：TWSE TWT48U_ALL），109 筆，只有上市（TWSE）有，TPEx 沒有對應資料源。
//
// 實測確認：symbol 不只有一般股票，也有 ETF（例如 00939、00984D），不是只有「上市股票」；
// ex_type 只有三種值：'息'（純除息）、'權'（純除權）、'權息'（合併發放）——是同一筆事件
// 用這個欄位標示類型，不是除權/除息各自分開一筆。純除息時權證相關欄位（stockDividendRatio
// 等）是 null，只有 cashDividend 有值。這張表是純原始公告資料，沒有還原參考價這類衍生欄位，
// 呼叫端要自己拿 exDate 對 daily_price 算除權息參考價/調整報酬率。
export interface ExDividendNoticeEntry {
  exDate: string; // "YYYY-MM-DD"，除權息基準日，是未來日期（TWSE 每天預告接下來的事件）
  exType: '息' | '權' | '權息';
  stockDividendRatio: number | null; // 股票股利比例（配股）
  subscriptionRatio: number | null; // 認購比例
  subscriptionPricePerShare: number | null; // 認購價
  cashDividend: number | null; // 現金股利（每股金額）
  sharesOffered: number | null;
  sharesEmpOwner: number | null;
  sharesholderOwner: number | null;
  stockHoldingRatio: number | null;
}

interface RawExDividendNoticeRow {
  symbol: string;
  ex_date: Date;
  ex_type: string;
  stock_dividend_ratio: number | null;
  subscription_ratio: number | null;
  subscription_price_per_share: number | null;
  cash_dividend: number | null;
  shares_offered: number | null;
  shares_emp_owner: number | null;
  sharesholder_owner: number | null;
  stock_holding_ratio: number | null;
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

  const result: Record<string, ExDividendNoticeEntry[]> = {};
  for (const row of rows) {
    const entry: ExDividendNoticeEntry = {
      exDate: row.ex_date.toISOString().slice(0, 10),
      exType: row.ex_type as ExDividendNoticeEntry['exType'],
      stockDividendRatio: row.stock_dividend_ratio,
      subscriptionRatio: row.subscription_ratio,
      subscriptionPricePerShare: row.subscription_price_per_share,
      cashDividend: row.cash_dividend,
      sharesOffered: row.shares_offered,
      sharesEmpOwner: row.shares_emp_owner,
      sharesholderOwner: row.sharesholder_owner,
      stockHoldingRatio: row.stock_holding_ratio,
    };
    (result[row.symbol] ??= []).push(entry);
  }
  return result;
};
