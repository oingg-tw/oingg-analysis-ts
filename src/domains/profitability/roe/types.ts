import type { Season } from '@/shared/rocQuarter';

export interface RoeQuery {
  companyId: string;
  year: string; // 民國年，例如 "115"
  season: Season;
  dataType: '1' | '2'; // 1 = 個體, 2 = 合併
  subsidiaryCompanyId: string;
}

export interface RoeResult {
  companyId: string;
  year: string;
  season: Season;
  dataType: '1' | '2';
  subsidiaryCompanyId: string;
  reportDate: string | null;

  // 單季 ROE（未年化）= 本季淨利 / 本季期末權益 * 100
  roeQuarterlyPct: number | null;
  // 單季 ROE 簡易年化（x4）
  roeQuarterlyAnnualizedPct: number | null;
  // TTM ROE = 近四季（含本季）淨利加總 / 本季期末權益 * 100；四季資料不齊則為 null
  roeTtmPct: number | null;

  netIncome: {
    fieldUsed: 'netIncomeAttributableToParent' | 'netIncome' | null;
    value: string | null; // BigInt as string
  };
  equity: {
    fieldUsed: 'equityAttributableToParent' | 'totalEquity' | null;
    value: string | null; // BigInt as string
  };

  ttm: {
    quartersUsed: string[]; // e.g. ["114Q3", "114Q4", "115Q1", "115Q2"]
    quartersMissing: string[];
  };

  warnings: string[];
}
