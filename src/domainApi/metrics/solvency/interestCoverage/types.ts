import type { Season } from '@/shared/rocQuarter';

export interface InterestCoverageQuery {
  companyId: string;
  // year/season 選填但要成對——不給就自動抓「這家公司損益表有資料」的最新一季
  // （見 shared/sourceData/latestQuarter.ts），只給其中一個視為無效請求（在 controller 用 zod refine 擋掉）。
  year?: string; // 民國年，例如 "115"
  season?: Season;
  dataType: '1' | '2'; // 1 = 個體, 2 = 合併
  subsidiaryCompanyId: string;
}

export interface InterestCoverageResult {
  companyId: string;
  // 實際使用的季度（不論是查詢時指定的，還是自動抓最新的）；查無任何季度資料時為 null。
  year: string | null;
  season: Season | null;
  dataType: '1' | '2';
  subsidiaryCompanyId: string;
  reportDate: string | null;

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

  ttm: {
    quartersUsed: string[];
    quartersMissing: string[];
  };

  warnings: string[];
}
