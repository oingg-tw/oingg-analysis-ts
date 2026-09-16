import type { AnnouncementDatePort } from '@/application/ports/announcementDates';

// 財報公告日 port 的假實作——鍵是 `${symbol}-${民國年}Q${季}`，例如 '2330-115Q2'。三段語意跟真實
// 的 getPriceAnchorDate 完全一致：有公告日回 announcement；沒有但呼叫端給了期末日就退回
// report_date_fallback；兩者都沒有回 null（呼叫端會 skipped_no_knowledge_date）。
export const createFixedAnnouncements = (announced: Record<string, Date> = {}): AnnouncementDatePort => ({
  getPriceAnchorDate: async (symbol, rocYear, season, reportDate) => {
    const date = announced[`${symbol}-${rocYear}Q${season}`];
    if (date) return { date, source: 'announcement' };
    if (reportDate) return { date: reportDate, source: 'report_date_fallback' };
    return null;
  },
});
