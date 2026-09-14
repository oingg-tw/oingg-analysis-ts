import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';

export type PriceAnchorSource = 'announcement' | 'report_date_fallback';

export interface PriceAnchorDate {
  date: Date;
  source: PriceAnchorSource;
}

interface RawAnnouncementRow {
  announcement_date: Date;
}

// 用來當「股價/市值基準日」的日期——優先用財報實際公告日（financial_report_announcement，
// 市場真正知道這份財報數字的那一天），查無公告日才退回財報期末日（reportDate，會計期間，
// 不是市場知道的時間點，有 look-ahead bias，但至少有值可以用）。兩者的差別跟為什麼要分開處理，
// 見 prisma/schema.prisma 的 FinancialReportAnnouncement 註解。
//
// **目前 financial_report_announcement 覆蓋範圍**：已用 2330/2887/6488 三家公司 114 年度資料
// 驗證過（各 4/4 筆，0 警訊），是刻意先驗證這個範圍，不是漏抓；還沒涵蓋到的公司/季度查詢會
// 落到 reportDate fallback，之後負責 ingest 的服務擴大 backfill 範圍後會自然變好——呼叫端要在
// source 是 'report_date_fallback' 時對外提示可能有 look-ahead bias。
export const getPriceAnchorDate = async (
  symbol: string,
  fiscalYear: number,
  fiscalQuarter: number,
  reportDate: Date | null
): Promise<PriceAnchorDate | null> => {
  const rows = await mopsExportPrisma.$queryRaw<RawAnnouncementRow[]>`
    SELECT announcement_date FROM "export"."financial_report_announcement"
    WHERE symbol = ${symbol} AND fiscal_year = ${fiscalYear} AND fiscal_quarter = ${fiscalQuarter}
    LIMIT 1
  `;
  const announcement = rows[0];
  if (announcement) return { date: announcement.announcement_date, source: 'announcement' };
  if (reportDate) return { date: reportDate, source: 'report_date_fallback' };
  return null;
};
