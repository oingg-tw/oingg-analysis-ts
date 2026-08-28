import type { Season } from '@/shared/rocQuarter';

export interface InterestCoverageQuery {
  companyId: string;
  year: string; // 民國年，例如 "115"
  season: Season;
  dataType: '1' | '2'; // 1 = 個體, 2 = 合併
  subsidiaryCompanyId: string;
}

export interface InterestCoverageResult {
  companyId: string;
  year: string;
  season: Season;
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
