import type { MetricResultMeta } from '@/shared/metricStatus';
import type { QuarterlyMetricQuery, QuarterlyMetricIdentity, QuarterlyMetricTtmInfo } from '@/shared/quarterlyMetric';

// year/season 選填但要成對——不給就自動抓「這家公司資產負債表/損益表/現金流量表都有資料」的最新一季
// （見 shared/sourceData/latestQuarter.ts），只給其中一個視為無效請求（在 controller 用 zod refine 擋掉）。
export type AccrualsRatioQuery = QuarterlyMetricQuery;

export interface AccrualsRatioResult extends QuarterlyMetricIdentity, MetricResultMeta {
  // 應計項目比率 = (淨利 - OCF - ICF) / 總資產 * 100。
  // 分母用**本季期末總資產**，不是 taxonomy 原文的「平均總資產」——跟 turnoverRatio 用期末餘額同一種
  // 刻意簡化（避免多查一期資料），跟 ROE/ROA 用期末權益/總資產也是同一種處理方式。
  // 數值越高代表淨利中「應計項目」（非現金認列的獲利）佔比越高，是財報品質/盈餘操縱風險的常用篩選指標，
  // 常搭配 ocfToNetIncome 一起判讀。
  accrualsRatioQuarterly: number | null;
  accrualsRatioQuarterlyAnnualized: number | null;
  // TTM = (近四季淨利加總 - 近四季 OCF 加總 - 近四季 ICF 加總) / 本季期末總資產 * 100
  accrualsRatioTtm: number | null;

  netIncome: {
    fieldUsed: 'netIncomeAttributableToParent' | 'netIncome' | null;
    value: string | null; // BigInt as string；本季淨利
  };
  netIncomeTtm: {
    value: string | null; // BigInt as string；近四季加總，資料不齊則為 null
  };
  operatingCashFlow: {
    value: string | null; // BigInt as string；本季營業活動現金流量（OCF）
  };
  operatingCashFlowTtm: {
    value: string | null; // BigInt as string；近四季加總，資料不齊則為 null
  };
  investingCashFlow: {
    value: string | null; // BigInt as string；本季投資活動現金流量（ICF，netCashFromInvestingActivities）
  };
  investingCashFlowTtm: {
    value: string | null; // BigInt as string；近四季加總，資料不齊則為 null
  };
  totalAssets: {
    value: string | null; // BigInt as string；本季期末總資產（分母，用期末值，不是平均值）
  };

  ttm: QuarterlyMetricTtmInfo;
}
