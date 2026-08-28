import type { Season } from '@/shared/rocQuarter';

export interface MarginsQuery {
  companyId: string;
  // year/season 選填但要成對——不給就自動抓「這家公司損益表有資料」的最新一季
  // （見 shared/latestQuarter.ts），只給其中一個視為無效請求（在 controller 用 zod refine 擋掉）。
  year?: string; // 民國年，例如 "115"
  season?: Season;
  dataType: '1' | '2'; // 1 = 個體, 2 = 合併
  subsidiaryCompanyId: string;
}

export interface MarginsResult {
  companyId: string;
  // 實際使用的季度（不論是查詢時指定的，還是自動抓最新的）；查無任何季度資料時為 null。
  year: string | null;
  season: Season | null;
  dataType: '1' | '2';
  subsidiaryCompanyId: string;
  reportDate: string | null;

  // 毛利率 = 本季毛利（grossProfit） / 本季營收 * 100
  grossMarginQuarterly: number | null;
  grossMarginTtm: number | null;

  // 營業利益率 = 本季營業利益（operatingIncome） / 本季營收 * 100
  operatingMarginQuarterly: number | null;
  operatingMarginTtm: number | null;

  // 稅後淨利率 = 本季淨利 / 本季營收 * 100
  // 這三個都是「同期流量 / 同期流量」的比率，本身不需要年化（不像 ROE 是流量對存量），
  // 所以只有單季跟 TTM 兩種口徑，沒有 quarterlyAnnualized。
  netProfitMarginQuarterly: number | null;
  netProfitMarginTtm: number | null;

  operatingRevenue: {
    value: string | null; // BigInt as string；本季營收
  };
  operatingRevenueTtm: {
    value: string | null; // BigInt as string；近四季加總，資料不齊則為 null
  };
  grossProfit: {
    value: string | null;
  };
  grossProfitTtm: {
    value: string | null;
  };
  operatingIncome: {
    value: string | null;
  };
  operatingIncomeTtm: {
    value: string | null;
  };
  netIncome: {
    fieldUsed: 'netIncomeAttributableToParent' | 'netIncome' | null;
    value: string | null;
  };
  netIncomeTtm: {
    value: string | null;
  };

  ttm: {
    quartersUsed: string[];
    quartersMissing: string[];
  };

  warnings: string[];
}
