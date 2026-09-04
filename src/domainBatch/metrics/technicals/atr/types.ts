import type { MetricStatus } from '@/shared/metricStatus';

export interface AtrQuery {
  symbol: string;
  asOfDate?: string; // 選填，格式 YYYY-MM-DD；不給就抓「這家公司目前最新一筆股價」。
}

export interface AtrWindowValue {
  value: number | null; // 元，跟股價同單位
  window: number;
}

export interface AtrResult {
  symbol: string;
  asOfDate: string | null;

  // 真實波動幅度的 Wilder 平滑移動平均，跟 RSI 同一種「前 window 期簡單平均當種子、之後遞迴
  // 平滑」慣例，見 src/shared/technicalMath.ts 的 averageTrueRange。需要 window+1 天的高低收
  // 才能算（要先算出 window 筆真實波動幅度）。
  atr14d: AtrWindowValue;
  atr20d: AtrWindowValue;

  dataCoverage: {
    tradingDays: number;
    earliestDate: string | null;
  };

  fieldStatuses: Record<string, MetricStatus>;
  warnings: string[];
}
