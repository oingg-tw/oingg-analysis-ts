import twseExportPrisma from '@/adapters/prisma/twseExportClient';
import { getCompanyNamesForSymbols } from '@/shared/sourceData/companyProfile';
import type { MaterialAnnouncementsQuery, MaterialAnnouncementsResult, MaterialAnnouncementRow } from './types';

interface RawMaterialAnnouncementRow {
  symbol: string;
  announcement_date: Date;
  announcement_time: string | null;
  report_date: Date | null;
  subject: string | null;
  clause: string | null;
  fact_date: Date | null;
  description: string | null;
}

// 上市公司每日重大訊息——2026-09-01 應使用者要求新增。範圍本身就是「上市公司」，不用額外
// 排除 ETF/衍生性商品。取最近公告的前 limit 筆（依公告日期、公告時間由新到舊），不是固定
// 某一天的資料，跟 disposedStocks/attentionStocks 同一種「清單」風格。
export const listMaterialAnnouncements = async (query: MaterialAnnouncementsQuery): Promise<MaterialAnnouncementsResult> => {
  const { limit } = query;
  const warnings: string[] = [];

  const rows = await twseExportPrisma.$queryRaw<RawMaterialAnnouncementRow[]>`
    SELECT symbol, announcement_date, announcement_time, report_date, subject, clause, fact_date, description
    FROM "export"."material_announcement"
    ORDER BY announcement_date DESC, announcement_time DESC
    LIMIT ${limit}
  `;

  if (rows.length === 0) {
    warnings.push('查無重大訊息資料。');
  }

  const companyNames = await getCompanyNamesForSymbols(rows.map((row) => row.symbol));
  const items: MaterialAnnouncementRow[] = rows.map((row) => ({
    symbol: row.symbol,
    companyName: companyNames.get(row.symbol) ?? null,
    announcementDate: row.announcement_date.toISOString().slice(0, 10),
    announcementTime: row.announcement_time,
    reportDate: row.report_date ? row.report_date.toISOString().slice(0, 10) : null,
    subject: row.subject,
    clause: row.clause,
    factDate: row.fact_date ? row.fact_date.toISOString().slice(0, 10) : null,
    description: row.description,
  }));

  return { limit, items, warnings };
};
