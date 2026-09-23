// 月營收歷史 port——twse-ts export.monthly_revenue（PROD，上市全市場 2021-09 起；只涵蓋上市，
// 實作層已篩掉公開發行未上市那批）。查無資料回空陣列，是正常情境不是錯誤。
// 實作在 infrastructure/repositories/twse/monthlyRevenue.ts。

export interface MonthlyRevenueEntry {
  yearMonth: string; // "YYYY-MM"
  reportDate: string | null; // 公告日 "YYYY-MM-DD"
  industry: string | null;
  currentMonthRevenue: string | null; // 當月營收（新台幣千元），bigint 序列化成字串
  lastYearSameMonthRevenue: string | null;
  yoyChangePercent: number | null; // 來源直接算好的欄位，原樣透傳
  momChangePercent: number | null; // 本服務用相鄰兩個月的 currentMonthRevenue 自己反推；最舊一筆固定 null
  cumulativeRevenue: string | null;
  cumulativeLastYearRevenue: string | null;
  cumulativeChangePercent: number | null;
  note: string | null;
}

export interface MonthlyRevenueHistoryResult {
  entries: MonthlyRevenueEntry[]; // 由舊到新
  total: number;
  hasMore: boolean;
}

export interface MonthlyRevenuePort {
  getMonthlyRevenueHistory(symbol: string, limit: number): Promise<MonthlyRevenueHistoryResult>;
}
