import type { MetricStatus } from '@/shared/metricStatus';

export interface BollingerBandsQuery {
  symbol: string;
  asOfDate?: string; // 選填，格式 YYYY-MM-DD；不給就抓「這家公司目前最新一筆股價」。
}

export interface BandValue {
  value: number | null;
  window: number; // 20D，2 個標準差——目前只支援這一組參數
}

export interface BollingerBandsResult {
  symbol: string;
  asOfDate: string | null;

  // middle = SMA(20)，upper/lower = middle ± 2 個母體標準差（不是樣本標準差），
  // 見 src/shared/technicalMath.ts 的 bollingerBands。三個欄位共用同一份資料齊不齊判斷
  // （middle 算得出來，upper/lower 就一定算得出來，三者不會分開缺）。
  middle: BandValue;
  upper: BandValue;
  lower: BandValue;

  dataCoverage: {
    tradingDays: number;
    earliestDate: string | null;
  };

  fieldStatuses: Record<string, MetricStatus>;
  warnings: string[];
}
