import type { MetricResultMeta } from '@/shared/metricStatus';
import type { QuarterlyMetricQuery, QuarterlyMetricIdentity, QuarterlyMetricTtmInfo } from '@/shared/quarterlyMetric';

// year/season 選填但要成對——不給就自動抓「這家公司損益表有資料」的最新一季
// （見 shared/sourceData/latestQuarter.ts），只給其中一個視為無效請求（在 controller 用 zod refine 擋掉）。
export type EpsQuery = QuarterlyMetricQuery;

export interface EpsResult extends QuarterlyMetricIdentity, MetricResultMeta {
  // 單季（未年化）EPS = 本季淨利 / 本季報告日對應的流通股數
  epsQuarterly: number | null;
  // 單季 EPS 簡易年化（x4）
  epsQuarterlyAnnualized: number | null;
  // TTM EPS = 近四季（含本季）淨利加總 / 本季報告日對應的流通股數
  epsTtm: number | null;

  netIncome: {
    fieldUsed: 'netIncomeAttributableToParent' | 'netIncome' | null;
    value: string | null; // BigInt as string；本季淨利
  };
  netIncomeTtm: {
    value: string | null; // BigInt as string；近四季加總，資料不齊則為 null
  };

  paidInShares: {
    value: string | null; // BigInt as string
    // 股本資料的生效年月（西元曆），是「實際套用的那筆股本紀錄生效於何時」，不是本季的民國年季。
    effectiveYear: number | null;
    effectiveMonth: number | null;
  };

  ttm: QuarterlyMetricTtmInfo;
}
