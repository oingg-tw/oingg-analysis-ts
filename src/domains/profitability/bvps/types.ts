import type { Season } from '@/shared/rocQuarter';

export interface BvpsQuery {
  companyId: string;
  year: string; // 民國年，例如 "115"
  season: Season;
  dataType: '1' | '2'; // 1 = 個體, 2 = 合併
  subsidiaryCompanyId: string;
}

export interface BvpsResult {
  companyId: string;
  year: string;
  season: Season;
  dataType: '1' | '2';
  subsidiaryCompanyId: string;
  reportDate: string | null;

  // BVPS 每股淨值 = 本季期末權益 / 股本歷史對應當時（報告日）的流通股數
  bvps: number | null;

  equity: {
    fieldUsed: 'equityAttributableToParent' | 'totalEquity' | null;
    value: string | null; // BigInt as string
  };

  paidInShares: {
    value: string | null; // BigInt as string
    // 股本資料的生效年月（西元曆），不是本季的民國年季——股本異動不是每季都有，
    // 這裡標的是「實際套用的那筆股本紀錄生效於何時」。
    effectiveYear: number | null;
    effectiveMonth: number | null;
  };

  warnings: string[];
}
