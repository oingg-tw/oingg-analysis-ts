import twsePrisma from '@/adapters/prisma/twseClient';
import { getCompanyNamesForSymbols } from '@/shared/sourceData/companyProfile';
import type { DisposedStocksQuery, DisposedStocksResult, DisposedStockRow } from './types';

interface RawDisposedStockRow {
  symbol: string;
  announce_date: Date;
  announcement_count: number | null;
  reason: string | null;
  disposition_period: string | null;
  disposition_measures: string | null;
  detail: string | null;
  link_information: string | null;
}

// 處置股票清單——2026-09-01 應使用者要求新增。twse-ts 已經濾掉權證只留真正上市公司，這裡不用
// 再濾一次。稀疏資料（多數日子 0 筆處置），不是排行榜，取最近公告的前 limit 筆（依公告日期
// 由新到舊），不是固定某一天的資料。
export const listDisposedStocks = async (query: DisposedStocksQuery): Promise<DisposedStocksResult> => {
  const { limit } = query;
  const warnings: string[] = [];

  const rows = await twsePrisma.$queryRaw<RawDisposedStockRow[]>`
    SELECT symbol, announce_date, announcement_count, reason, disposition_period, disposition_measures, detail, link_information
    FROM "export"."disposed_stock"
    ORDER BY announce_date DESC
    LIMIT ${limit}
  `;

  if (rows.length === 0) {
    warnings.push('查無處置股票資料。');
  }

  const companyNames = await getCompanyNamesForSymbols(rows.map((row) => row.symbol));
  const items: DisposedStockRow[] = rows.map((row) => ({
    symbol: row.symbol,
    companyName: companyNames.get(row.symbol) ?? null,
    announceDate: row.announce_date.toISOString().slice(0, 10),
    announcementCount: row.announcement_count,
    reason: row.reason,
    dispositionPeriod: row.disposition_period,
    dispositionMeasures: row.disposition_measures,
    detail: row.detail,
    linkInformation: row.link_information,
  }));

  return { limit, items, warnings };
};
