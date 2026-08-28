import type { Season } from '@/shared/rocQuarter';

export interface DebtRatioQuery {
  companyId: string;
  year: string; // 民國年，例如 "115"
  season: Season;
  dataType: '1' | '2'; // 1 = 個體, 2 = 合併
  subsidiaryCompanyId: string;
}

export interface DebtRatioResult {
  companyId: string;
  year: string;
  season: Season;
  dataType: '1' | '2';
  subsidiaryCompanyId: string;
  reportDate: string | null;

  // 負債比率 = 本季期末總負債 / 本季期末總資產 * 100。
  // 純資產負債表的時點快照，不像 ROE/ROA 那樣有單季/年化/TTM 的區別——資產負債表本身就是某一天的餘額，
  // 沒有「近四季加總」這種概念可以套用。
  debtRatioPct: number | null;

  totalLiabilities: {
    value: string | null; // BigInt as string
  };
  totalAssets: {
    value: string | null; // BigInt as string
  };

  warnings: string[];
}
