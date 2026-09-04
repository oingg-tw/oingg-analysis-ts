import type { MetricStatus } from '@/shared/metricStatus';

export interface BiasQuery {
  symbol: string;
  asOfDate?: string; // 選填，格式 YYYY-MM-DD；不給就抓「這家公司目前最新一筆股價」。
}

export interface BiasWindowValue {
  value: number | null; // 百分比
  window: number;
}

export interface BiasResult {
  symbol: string;
  asOfDate: string | null;

  // BIAS（乖離率） = (收盤 - MA) / MA x 100%——MA 用 simpleMovingAverage 現算（跟
  // GET /technicals/ma 同一個函式，同一個視窗長度會得到一樣的 MA 值），不是重複實作。
  bias5d: BiasWindowValue;
  bias20d: BiasWindowValue;
  bias60d: BiasWindowValue;

  dataCoverage: {
    tradingDays: number;
    earliestDate: string | null;
  };

  fieldStatuses: Record<string, MetricStatus>;
  warnings: string[];
}
