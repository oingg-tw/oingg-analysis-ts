import type { MetricResultMeta } from '@/shared/metricStatus';
import type { QuarterlyMetricQuery, QuarterlyMetricIdentity, QuarterlyMetricTtmInfo } from '@/shared/quarterlyMetric';

// year/season 選填但要成對——不給就自動抓「這家公司資產負債表跟損益表都有資料」的最新一季
// （見 shared/sourceData/latestQuarter.ts），只給其中一個視為無效請求（在 controller 用 zod refine 擋掉）。
export type RoaQuery = QuarterlyMetricQuery;

export interface RoaResult extends QuarterlyMetricIdentity, MetricResultMeta {
  // 單季 ROA（未年化）= 本季淨利 / 本季期末總資產 * 100
  roaQuarterlyPct: number | null;
  // 單季 ROA 簡易年化（x4）
  roaQuarterlyAnnualizedPct: number | null;
  // TTM ROA = 近四季（含本季）淨利加總 / 本季期末總資產 * 100；四季資料不齊則為 null
  roaTtmPct: number | null;

  netIncome: {
    fieldUsed: 'netIncomeAttributableToParent' | 'netIncome' | null;
    value: string | null; // BigInt as string
  };
  totalAssets: {
    value: string | null; // BigInt as string
  };

  ttm: QuarterlyMetricTtmInfo;
}
