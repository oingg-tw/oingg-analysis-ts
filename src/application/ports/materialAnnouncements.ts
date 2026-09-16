// 上市公司每日重大訊息（export.material_announcement）port——實作在
// infrastructure/repositories/twse/materialAnnouncement.ts。
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

export interface MaterialAnnouncementPort {
  // 依公告日期、公告時間由新到舊取 limit 筆。
  listLatestMaterialAnnouncements(limit: number): Promise<RawMaterialAnnouncementRow[]>;
}
