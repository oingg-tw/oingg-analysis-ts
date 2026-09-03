export interface MaterialAnnouncementsQuery {
  limit: number; // 1~50，預設 20
}

export interface MaterialAnnouncementRow {
  symbol: string;
  companyName: string | null;
  announcementDate: string;
  announcementTime: string | null; // 原始字串格式（例如 "70003"），不是標準 HH:MM:SS
  reportDate: string | null;
  subject: string | null;
  clause: string | null;
  factDate: string | null;
  description: string | null;
}

export interface MaterialAnnouncementsResult {
  limit: number;
  items: MaterialAnnouncementRow[];
  warnings: string[];
}
