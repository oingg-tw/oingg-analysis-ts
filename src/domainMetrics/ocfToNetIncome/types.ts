import type { MetricResultMeta } from '@/shared/metricStatus';
import type { QuarterlyMetricQuery, QuarterlyMetricIdentity, QuarterlyMetricTtmInfo } from '@/shared/quarterlyMetric';

// year/season 選填但要成對——不給就自動抓「這家公司損益表跟現金流量表都有資料」的最新一季
// （見 shared/sourceData/latestQuarter.ts），只給其中一個視為無效請求（在 controller 用 zod refine 擋掉）。
export type OcfToNetIncomeQuery = QuarterlyMetricQuery;

export interface OcfToNetIncomeResult extends QuarterlyMetricIdentity, MetricResultMeta {
  // 營運現金流對淨利比（倍）= 本季營業活動現金流量（OCF） / 本季淨利。
  // 「流量/流量」比率，本身不需要年化，只有單季跟 TTM 兩種口徑，跟毛利率/利息保障倍數同一種結構。
  // 比率越接近或超過 1 代表帳面獲利有真實現金流量支撐，明顯低於 1（尤其是負值或連續下滑）
  // 可能是應計項目膨脹或盈餘品質偏弱的訊號，常拿來搭配 Accruals_Ratio 一起看。
  ocfToNetIncomeQuarterly: number | null;
  ocfToNetIncomeTtm: number | null;

  operatingCashFlow: {
    value: string | null; // BigInt as string；本季 netCashFromOperatingActivities
  };
  operatingCashFlowTtm: {
    value: string | null; // BigInt as string；近四季加總，資料不齊則為 null
  };
  netIncome: {
    fieldUsed: 'netIncomeAttributableToParent' | 'netIncome' | null;
    value: string | null; // BigInt as string；本季淨利
  };
  netIncomeTtm: {
    value: string | null; // BigInt as string；近四季加總，資料不齊則為 null
  };

  ttm: QuarterlyMetricTtmInfo;
}
