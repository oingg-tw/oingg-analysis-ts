import twseExportPrisma from '@/infrastructure/prisma/twseExportClient';
import type { MaterialAnnouncementPort } from '@/application/ports/materialAnnouncements';

// 上市公司每日重大訊息（export.material_announcement）——2026-09-17 重構 Phase 2 從
// http/modules/market/materialAnnouncements/service.ts 搬來的 raw SQL（逐字），回傳原始列形狀。
export interface RawMaterialAnnouncementRow {
  symbol: string;
  announcement_date: Date;
  announcement_time: string | null;
  report_date: Date | null;
  subject: string | null;
  clause: string | null;
  fact_date: Date | null;
  description: string | null;
}

// 最近公告的前 limit 筆（依公告日期、公告時間由新到舊）。
export const listLatestMaterialAnnouncements = (limit: number): Promise<RawMaterialAnnouncementRow[]> =>
  twseExportPrisma.$queryRaw<RawMaterialAnnouncementRow[]>`
    SELECT symbol, announcement_date, announcement_time, report_date, subject, clause, fact_date, description
    FROM "export"."material_announcement"
    ORDER BY announcement_date DESC, announcement_time DESC
    LIMIT ${limit}
  `;

// application/ports/materialAnnouncements.ts 的實作——src/bootstrap/deps.ts 綁進 AppDeps。
export const twseMaterialAnnouncements: MaterialAnnouncementPort = { listLatestMaterialAnnouncements };
