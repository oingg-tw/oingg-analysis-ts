import type { MetricStatus } from '@/shared/metricStatus';

export interface KdQuery {
  symbol: string;
  asOfDate?: string; // 選填，格式 YYYY-MM-DD；不給就抓「這家公司目前最新一筆股價」。
}

export interface KdWindowValue {
  value: number | null; // 0~100
  window: number;
}

export interface KdResult {
  symbol: string;
  asOfDate: string | null;

  // K/D 初始值用業界慣例的 50，從序列最開頭能算出 RSV 的地方開始遞迴到 asOfDate，
  // 見 src/shared/technicalMath.ts 的 stochasticKD。K/D 各自拆成獨立欄位（不是包在同一個
  // kd9d 物件裡），跟 filterCatalog.ts「欄位層級」的顆粒度慣例一致——K、D 是兩個各自可以
  // filter 的數值，不是同一個數字的兩種呈現方式。資料筆數不足時回傳 null。
  k9d: KdWindowValue;
  d9d: KdWindowValue;
  k14d: KdWindowValue;
  d14d: KdWindowValue;

  dataCoverage: {
    tradingDays: number;
    earliestDate: string | null;
  };

  fieldStatuses: Record<string, MetricStatus>;
  warnings: string[];
}
