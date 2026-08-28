import type { Season } from '@/shared/rocQuarter';

export interface LiquidityRatioQuery {
  companyId: string;
  year: string; // 民國年，例如 "115"
  season: Season;
  dataType: '1' | '2'; // 1 = 個體, 2 = 合併
  subsidiaryCompanyId: string;
}

export interface LiquidityRatioResult {
  companyId: string;
  year: string;
  season: Season;
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
