import type { CalcResult } from '@/domain/metrics/shared/numericHelpers';

// 2026-09-25 改成「公告的普通股每股現金股利」加總，不再用現金流量表反推——使用者拍板（方案 2）：
// 每股股利一般指「普通股每股配多少」（台灣實務就是公司公告的每股配發金額，例：2882 國泰金 2.0 元），
// 而現金流量表的「發放現金股利」是普通股＋特別股股利的合計、還要除以含特別股的股數，17 家有特別股的公司
// 兩頭都錯。公告值本來就是普通股、本來就是每股，完全不需要股數。
//
// 窗口：除息日落在 (窗口終點 − 1 年, 窗口終點]——起點排除，理由同 dividendDistributionCount（季配公司剛好相隔
// 365 天那一次不能算兩次）。每股現金股利 = 盈餘分配 + 法定盈餘公積與資本公積發放（兩者都是發給普通股的現金）。
//
// 資料起點：mops-ts 股利公告全市場回補到民國 108 年度的分派（除息日約從 2019-09 起），更早只有三十幾家。
// 所以窗口要完全落在 2019-10-01 之後：窗口起點（不含）早於 2019-09-30 的一律 insufficient_history，不拿殘缺的資料硬算。
export const DIVIDEND_EVENTS_WINDOW_START_FLOOR = new Date('2019-09-30T00:00:00.000Z');

export interface CommonCashDividendEvent {
  exDividendDate: Date | null;
  cashDividendFromEarnings: number | null;
  cashDividendFromLegalReserveAndCapitalSurplus: number | null;
}

export const calculateDividendPerShare = (events: CommonCashDividendEvent[], windowEnd: Date): CalcResult => {
  const windowStart = new Date(windowEnd);
  windowStart.setUTCFullYear(windowStart.getUTCFullYear() - 1);
  if (windowStart < DIVIDEND_EVENTS_WINDOW_START_FLOOR) return { value: null, nullReason: 'insufficient_history' };
  // 這家公司在股利公告資料裡一筆都沒有：分不出「從來沒配過」還是「上游沒收到」，不當成 0。
  if (events.length === 0) return { value: null, nullReason: 'missing_input' };
  const total = events
    .filter((e) => e.exDividendDate !== null && e.exDividendDate > windowStart && e.exDividendDate <= windowEnd)
    .reduce((sum, e) => sum + (e.cashDividendFromEarnings ?? 0) + (e.cashDividendFromLegalReserveAndCapitalSurplus ?? 0), 0);
  return { value: Math.round(total * 100) / 100, nullReason: null };
};
