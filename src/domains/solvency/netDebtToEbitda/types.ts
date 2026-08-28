import type { Season } from '@/shared/rocQuarter';

export interface NetDebtToEbitdaQuery {
  companyId: string;
  // year/season 選填但要成對——不給就自動抓「這家公司資產負債表/損益表/現金流量表都有資料」的
  // 最新一季（見 shared/latestQuarter.ts），只給其中一個視為無效請求（在 controller 用 zod refine 擋掉）。
  year?: string; // 民國年，例如 "115"
  season?: Season;
  dataType: '1' | '2'; // 1 = 個體, 2 = 合併
  subsidiaryCompanyId: string;
}

export interface NetDebtToEbitdaResult {
  companyId: string;
  // 實際使用的季度（不論是查詢時指定的，還是自動抓最新的）；查無任何季度資料時為 null。
  year: string | null;
  season: Season | null;
  dataType: '1' | '2';
  subsidiaryCompanyId: string;
  reportDate: string | null;

  // 淨負債對 EBITDA 比 = 本季期末淨負債 / EBITDA。
  // 淨負債（存量，本季期末）對「一年份」EBITDA（流量）的比率，taxonomy 只支援 TTM/FY，不支援單季——
  // 拿淨負債除以「一季」的 EBITDA 沒有標準意義（單位是「幾季還完」還是「幾年還完」會混淆），
  // 所以只有簡單年化（單季 EBITDA x4）跟 TTM 兩種口徑，沒有原始單季版本。
  netDebtToEbitdaQuarterlyAnnualized: number | null;
  netDebtToEbitdaTtm: number | null;

  netDebt: {
    // 本季期末：有息負債 - 現金及約當現金。可能是負數（代表淨現金部位，不是淨負債）。
    value: string | null; // BigInt as string
  };
  totalDebt: {
    value: string | null; // BigInt as string；有息負債（短期借款+應付公司債+長期借款）
  };
  cashAndEquivalents: {
    value: string | null; // BigInt as string
  };

  ebitdaQuarterly: {
    value: string | null; // BigInt as string；本季 EBITDA = EBIT + 折舊 + 攤銷
  };
  ebitdaTtm: {
    value: string | null; // BigInt as string；近四季加總，資料不齊則為 null
  };

  ttm: {
    quartersUsed: string[];
    quartersMissing: string[];
  };

  warnings: string[];
}
