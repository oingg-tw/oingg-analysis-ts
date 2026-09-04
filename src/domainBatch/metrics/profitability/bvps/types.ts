import type { Season } from '@/shared/rocQuarter';
import type { MetricStatus } from '@/shared/metricStatus';

export interface BvpsQuery {
  symbol: string;
  // year/season 選填但要成對——不給就自動抓「這家公司資產負債表有資料」的最新一季
  // （見 shared/sourceData/latestQuarter.ts），只給其中一個視為無效請求（在 controller 用 zod refine 擋掉）。
  year?: string; // 民國年，例如 "115"
  season?: Season;
  dataType: '1' | '2'; // 1 = 個體, 2 = 合併
  subsidiaryCompanyId: string;
}

export interface BvpsResult {
  symbol: string;
  // 實際使用的季度（不論是查詢時指定的，還是自動抓最新的）；查無任何季度資料時為 null。
  year: string | null;
  season: Season | null;
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

  fieldStatuses: Record<string, MetricStatus>;
  warnings: string[];
}
