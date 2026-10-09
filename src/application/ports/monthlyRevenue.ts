// 月營收歷史 port——上市（twse-ts）＋上櫃（tpex-ts）全市場，2021-09 起共 60 個月；實作層先查上市、
// 查無資料再查上櫃，並已篩掉公開發行未上市那批。查無資料回空陣列，是正常情境不是錯誤。
// 實作在 infrastructure/repositories/twse/monthlyRevenue.ts。

import type { CompanyMonthlyRevenue } from '@/domain/industry/sectorAggregates';

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
  // 2026-10-09 類股月營收彙總用：這批公司全部月份的當月與去年同月營收（千元）。同一家公司上市有資料就只用上市、
  // 否則用上櫃（跟 getMonthlyRevenueHistory 同一條規則，轉板公司不會重複算）。
  listMonthlyRevenueForSymbols(symbols: string[]): Promise<CompanyMonthlyRevenue[]>;
}
