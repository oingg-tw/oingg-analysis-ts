import type { MetricResultMeta } from '@/shared/metricStatus';
import type { QuarterlyMetricQuery, QuarterlyMetricIdentity, QuarterlyMetricTtmInfo } from '@/shared/quarterlyMetric';

// year/season 選填但要成對——不給就自動抓「這家公司損益表有資料」的最新一季
// （見 shared/sourceData/latestQuarter.ts），只給其中一個視為無效請求（在 controller 用 zod refine 擋掉）。
export type InterestCoverageQuery = QuarterlyMetricQuery;

export interface InterestCoverageResult extends QuarterlyMetricIdentity, MetricResultMeta {
  // 利息保障倍數（次）= EBIT / 利息費用（financeCosts）
  // EBIT = 稅前淨利（profitBeforeTax） + 利息費用（financeCosts），反推回加計利息費用前的獲利。
  // 這是「同期流量 / 同期流量」的比率，本身不需要年化，只有單季跟 TTM 兩種口徑，
  // 跟毛利率/營業利益率/稅後淨利率同一種結構。
  interestCoverageQuarterly: number | null;
  interestCoverageTtm: number | null;

  ebit: {
    value: string | null; // BigInt as string；本季 EBIT
  };
  ebitTtm: {
    value: string | null; // BigInt as string；近四季加總，資料不齊則為 null
  };
  interestExpense: {
    value: string | null; // BigInt as string；本季利息費用
  };
  interestExpenseTtm: {
    value: string | null; // BigInt as string；近四季加總，資料不齊則為 null
  };

  ttm: QuarterlyMetricTtmInfo;
}
