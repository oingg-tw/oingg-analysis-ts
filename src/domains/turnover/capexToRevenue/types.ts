import type { Season } from '@/shared/rocQuarter';

export interface CapexToRevenueQuery {
  companyId: string;
  // year/season 選填但要成對——不給就自動抓「這家公司損益表跟現金流量表都有資料」的最新一季
  // （見 shared/latestQuarter.ts），只給其中一個視為無效請求（在 controller 用 zod refine 擋掉）。
  year?: string; // 民國年，例如 "115"
  season?: Season;
  dataType: '1' | '2'; // 1 = 個體, 2 = 合併
  subsidiaryCompanyId: string;
}

export interface CapexToRevenueResult {
  companyId: string;
  // 實際使用的季度（不論是查詢時指定的，還是自動抓最新的）；查無任何季度資料時為 null。
  year: string | null;
  season: Season | null;
  dataType: '1' | '2';
  subsidiaryCompanyId: string;
  reportDate: string | null;

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

  ttm: {
    quartersUsed: string[];
    quartersMissing: string[];
  };

  warnings: string[];
}
