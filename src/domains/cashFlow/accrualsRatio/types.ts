import type { Season } from '@/shared/rocQuarter';

export interface AccrualsRatioQuery {
  companyId: string;
  year: string; // 民國年，例如 "115"
  season: Season;
  dataType: '1' | '2'; // 1 = 個體, 2 = 合併
  subsidiaryCompanyId: string;
}

export interface AccrualsRatioResult {
  companyId: string;
  year: string;
  season: Season;
  dataType: '1' | '2';
  subsidiaryCompanyId: string;
  reportDate: string | null;

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

  ttm: {
    quartersUsed: string[];
    quartersMissing: string[];
  };

  warnings: string[];
}
