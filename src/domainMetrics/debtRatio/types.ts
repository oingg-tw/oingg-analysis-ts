import type { MetricResultMeta } from '@/shared/metricStatus';
import type { QuarterlyMetricQuery, QuarterlyMetricIdentity } from '@/shared/quarterlyMetric';

// year/season 選填但要成對——不給就自動抓「這家公司資產負債表有資料」的最新一季
// （見 shared/sourceData/latestQuarter.ts），只給其中一個視為無效請求（在 controller 用 zod refine 擋掉）。
export type DebtRatioQuery = QuarterlyMetricQuery;

export interface DebtRatioResult extends QuarterlyMetricIdentity, MetricResultMeta {
  // 負債比率 = 本季期末總負債 / 本季期末總資產 * 100。
  // 純資產負債表的時點快照，不像 ROE/ROA 那樣有單季/年化/TTM 的區別——資產負債表本身就是某一天的餘額，
  // 沒有「近四季加總」這種概念可以套用。
  debtRatioPct: number | null;

  totalLiabilities: {
    value: string | null; // BigInt as string
  };
  totalAssets: {
    value: string | null; // BigInt as string
  };
}
