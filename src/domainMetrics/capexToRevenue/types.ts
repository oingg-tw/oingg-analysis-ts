import type { MetricResultMeta } from '@/shared/metricStatus';
import type { QuarterlyMetricQuery, QuarterlyMetricIdentity, QuarterlyMetricTtmInfo } from '@/shared/quarterlyMetric';

// year/season 選填但要成對——不給就自動抓「這家公司損益表跟現金流量表都有資料」的最新一季
// （見 shared/sourceData/latestQuarter.ts），只給其中一個視為無效請求（在 controller 用 zod refine 擋掉）。
export type CapexToRevenueQuery = QuarterlyMetricQuery;

export interface CapexToRevenueResult extends QuarterlyMetricIdentity, MetricResultMeta {
  // 資本支出佔營收比 = 本季資本支出（capitalExpenditures，取絕對值） / 本季營收 * 100。
  // 這是「同期流量 / 同期流量」的比率，本身不需要年化，只有單季跟 TTM 兩種口徑，
  // 跟毛利率/營業利益率/稅後淨利率同一種結構。
  capexToRevenueQuarterly: number | null;
  capexToRevenueTtm: number | null;

  capitalExpenditures: {
    // 資料庫裡 capitalExpenditures 本身是負數（現金流出），這裡回傳原始值（負數），
    // 但比率計算用絕對值——資本支出佔營收比是慣例上的正數百分比，不是負的。
    value: string | null; // BigInt as string；本季資本支出（現金流量表原始值，負數）
  };
  capitalExpendituresTtm: {
    value: string | null; // BigInt as string；近四季加總（負數），資料不齊則為 null
  };
  operatingRevenue: {
    value: string | null; // BigInt as string；本季營收
  };
  operatingRevenueTtm: {
    value: string | null; // BigInt as string；近四季加總，資料不齊則為 null
  };

  ttm: QuarterlyMetricTtmInfo;
}
