import type { MetricStatus } from '@/shared/metricStatus';

export interface MaQuery {
  companyId: string;
  // 選填，格式 YYYY-MM-DD；不給就抓「這家公司目前最新一筆股價」。逐日市場資料，
  // 跟其他指標的 year/season 是不同的查詢介面，跟 marketRatios/beta 同一種模式。
  asOfDate?: string;
}

export interface MaWindowValue {
  value: number | null;
  window: number; // 實際使用的天數視窗（5/10/20/60/120/200）
}

export interface MaResult {
  companyId: string;
  asOfDate: string | null; // 實際使用的基準日；完全查無資料則為 null

  // SMA（簡單移動平均），業界慣例這幾個天數窗口都是簡單平均，不是指數平均（EMA 只用在 MACD）。
  // 資料筆數不足 N 天時該窗口回傳 null，不代表算錯，是還沒有足夠歷史，見 fieldStatuses。
  ma5d: MaWindowValue;
  ma10d: MaWindowValue;
  ma20d: MaWindowValue;
  ma60d: MaWindowValue;
  ma120d: MaWindowValue;
  ma200d: MaWindowValue;

  dataCoverage: {
    tradingDays: number; // 這次查詢用到的股價序列總筆數（asOfDate 以前全部歷史）
    earliestDate: string | null;
  };

  fieldStatuses: Record<string, MetricStatus>;
  warnings: string[];
}
