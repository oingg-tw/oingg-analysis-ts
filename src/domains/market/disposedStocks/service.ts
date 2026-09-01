import twsePrisma from '@/adapters/prisma/twseClient';
import tpexExportPrisma from '@/adapters/prisma/tpexExportClient';
import { getCompanyNamesForSymbols } from '@/shared/sourceData/companyProfile';
import type { DisposedStocksQuery, DisposedStocksResult, DisposedStockRow } from './types';

interface RawTwseDisposedStockRow {
  symbol: string;
  announce_date: Date;
  announcement_count: number | null;
  reason: string | null;
  disposition_period: string | null;
  disposition_measures: string | null;
  detail: string | null;
  link_information: string | null;
}

interface RawTpexDisposedStockRow {
  symbol: string;
  announce_date: Date;
  reason: string | null;
  disposition_period: string | null;
  detail: string | null;
}

interface PoolRow {
  market: 'TWSE' | 'TPEx';
  symbol: string;
  announce_date: Date;
  announcement_count: number | null;
  reason: string | null;
  disposition_period: string | null;
  disposition_measures: string | null;
  detail: string | null;
  link_information: string | null;
}

// 處置股票清單——2026-09-01 應使用者要求新增，之後又應要求合併上市（twse-ts）+ 上櫃
// （tpex-ts）。兩邊都已經濾掉權證只留真正公司，這裡不用再濾一次。稀疏資料（多數日子 0 筆
// 處置），不是排行榜，取最近公告的前 limit 筆（依公告日期由新到舊）——各自先取前 limit 筆
// （已經是各自依日期排序好的），合併候選池後再重排取前 limit 筆，這樣兩邊各自最近的
// limit 筆一定足夠湊出合併後真正的前 limit 筆，不用查全部歷史資料。
//
// TPEx 版本欄位比 TWSE 精簡（沒有 announcement_count/disposition_measures/
// link_information），沒有的欄位回傳 null，不是查詢失敗。
export const listDisposedStocks = async (query: DisposedStocksQuery): Promise<DisposedStocksResult> => {
  const { limit } = query;
  const warnings: string[] = [];

  const [twseRows, tpexRows] = await Promise.all([
    twsePrisma.$queryRaw<RawTwseDisposedStockRow[]>`
      SELECT symbol, announce_date, announcement_count, reason, disposition_period, disposition_measures, detail, link_information
      FROM "export"."disposed_stock"
      ORDER BY announce_date DESC
      LIMIT ${limit}
    `,
    tpexExportPrisma.$queryRaw<RawTpexDisposedStockRow[]>`
      SELECT symbol, announce_date, reason, disposition_period, detail
      FROM "export"."disposed_stock"
      ORDER BY announce_date DESC
      LIMIT ${limit}
    `,
  ]);

  const pool: PoolRow[] = [
    ...twseRows.map((row): PoolRow => ({ market: 'TWSE', ...row })),
    ...tpexRows.map(
      (row): PoolRow => ({
        market: 'TPEx',
        symbol: row.symbol,
        announce_date: row.announce_date,
        announcement_count: null,
        reason: row.reason,
        disposition_period: row.disposition_period,
        disposition_measures: null,
        detail: row.detail,
        link_information: null,
      })
    ),
  ];

  const sorted = [...pool].sort((a, b) => b.announce_date.getTime() - a.announce_date.getTime()).slice(0, limit);

  if (sorted.length === 0) {
    warnings.push('查無處置股票資料。');
  }

  const companyNames = await getCompanyNamesForSymbols(sorted.map((row) => row.symbol));
  const items: DisposedStockRow[] = sorted.map((row) => ({
    symbol: row.symbol,
    companyName: companyNames.get(row.symbol) ?? null,
    market: row.market,
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
