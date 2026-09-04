import type { MetricStatus } from '@/shared/metricStatus';

export interface RsiQuery {
  symbol: string;
  asOfDate?: string; // 選填，格式 YYYY-MM-DD；不給就抓「這家公司目前最新一筆股價」。
}

export interface RsiWindowValue {
  value: number | null; // 0~100
  window: number;
}

export interface RsiResult {
  symbol: string;
  asOfDate: string | null;

  // Wilder's RSI，業界最常見的版本（前 window 期漲跌幅簡單平均當種子，之後 Wilder 平滑遞迴），
  // 見 src/shared/technicalMath.ts 的 wilderRsi。資料筆數不足時回傳 null，不代表算錯。
  rsi6d: RsiWindowValue;
  rsi14d: RsiWindowValue;
  rsi24d: RsiWindowValue;

  dataCoverage: {
    tradingDays: number;
    earliestDate: string | null;
  };

  fieldStatuses: Record<string, MetricStatus>;
  warnings: string[];
}
