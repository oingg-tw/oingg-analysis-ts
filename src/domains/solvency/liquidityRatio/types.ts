import type { Season } from '@/shared/rocQuarter';

export interface LiquidityRatioQuery {
  companyId: string;
  // year/season 選填但要成對——不給就自動抓「這家公司資產負債表有資料」的最新一季
  // （見 shared/latestQuarter.ts），只給其中一個視為無效請求（在 controller 用 zod refine 擋掉）。
  year?: string; // 民國年，例如 "115"
  season?: Season;
  dataType: '1' | '2'; // 1 = 個體, 2 = 合併
  subsidiaryCompanyId: string;
}

export interface LiquidityRatioResult {
  companyId: string;
  // 實際使用的季度（不論是查詢時指定的，還是自動抓最新的）；查無任何季度資料時為 null。
  year: string | null;
  season: Season | null;
  dataType: '1' | '2';
  subsidiaryCompanyId: string;
  reportDate: string | null;

  // 流動比率 = 本季期末流動資產 / 本季期末流動負債 * 100
  currentRatioPct: number | null;
  // 速動比率 = (本季期末流動資產 - 存貨) / 本季期末流動負債 * 100
  // 跟負債比率一樣，這是純資產負債表的時點快照，沒有單季/年化/TTM 的區別。
  quickRatioPct: number | null;
  // 現金比率 = 本季期末現金及約當現金 / 本季期末流動負債 * 100
  cashRatioPct: number | null;

  currentAssets: {
    value: string | null; // BigInt as string
  };
  currentLiabilities: {
    value: string | null; // BigInt as string
  };
  inventory: {
    value: string | null; // BigInt as string
  };
  cashAndEquivalents: {
    value: string | null; // BigInt as string
  };

  warnings: string[];
}
