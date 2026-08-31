import type { Season } from '@/shared/rocQuarter';

export interface DeRatioQuery {
  companyId: string;
  // year/season 選填但要成對——不給就自動抓「這家公司資產負債表有資料」的最新一季
  // （見 shared/sourceData/latestQuarter.ts），只給其中一個視為無效請求（在 controller 用 zod refine 擋掉）。
  year?: string; // 民國年，例如 "115"
  season?: Season;
  dataType: '1' | '2'; // 1 = 個體, 2 = 合併
  subsidiaryCompanyId: string;
}

export interface DeRatioResult {
  companyId: string;
  // 實際使用的季度（不論是查詢時指定的，還是自動抓最新的）；查無任何季度資料時為 null。
  year: string | null;
  season: Season | null;
  dataType: '1' | '2';
  subsidiaryCompanyId: string;
  reportDate: string | null;

  // 負債權益比 = 本季期末有息負債（短期借款 + 應付公司債 + 長期借款） / 本季期末權益 * 100。
  // 分子是「有息負債」，不是總負債（那是 Debt_to_Assets 在算的），純資產負債表時點快照，
  // 沒有單季/年化/TTM 的區別。
  deRatioPct: number | null;

  totalDebt: {
    // 三個有息負債欄位加總；任一欄位為 null 視為 0（沒有借那種負債），不是資料缺漏。
    value: string | null; // BigInt as string
  };
  equity: {
    fieldUsed: 'equityAttributableToParent' | 'totalEquity' | null;
    value: string | null; // BigInt as string
  };

  warnings: string[];
}
