// 財報公告日 port——knowledge_date 傳染（application/metrics/knowledgeDate.ts）的唯一 I/O 依賴。
// 語意（實作在 infrastructure/repositories/mops/reportAnnouncementDate.ts）：優先回財報實際公告日
// （source='announcement'，市場真正知道數字的那一天）；查無公告日才退回呼叫端給的財報期末日
// （source='report_date_fallback'，有 look-ahead bias，呼叫端要標示）；連期末日都沒有回 null。
// tests/fakes/pit/fixedAnnouncements.ts 的假實作必須維持同一套三段語意。
export type PriceAnchorSource = 'announcement' | 'report_date_fallback';

export interface PriceAnchorDate {
  date: Date;
  source: PriceAnchorSource;
}

export interface AnnouncementDatePort {
  getPriceAnchorDate(symbol: string, rocYear: number, season: number, reportDate: Date | null): Promise<PriceAnchorDate | null>;
}
