import type { Season } from '@/shared/rocQuarter';
import type { MetricStatus } from '@/shared/metricStatus';

export interface RevenuePerShareQuery {
  symbol: string;
  // year/season 選填但要成對——不給就自動抓「這家公司損益表有資料」的最新一季
  // （見 shared/sourceData/latestQuarter.ts），只給其中一個視為無效請求（在 controller 用 zod refine 擋掉）。
  year?: string; // 民國年，例如 "115"
  season?: Season;
  dataType: '1' | '2'; // 1 = 個體, 2 = 合併
  subsidiaryCompanyId: string;
}

export interface RevenuePerShareResult {
  symbol: string;
  // 實際使用的季度（不論是查詢時指定的，還是自動抓最新的）；查無任何季度資料時為 null。
  year: string | null;
  season: Season | null;
  dataType: '1' | '2';
  subsidiaryCompanyId: string;
  reportDate: string | null;

  // 單季（未年化）每股營收 = 本季營收 / 本季報告日對應的流通股數
  revenuePerShareQuarterly: number | null;
  // 單季每股營收簡易年化（x4）
  revenuePerShareQuarterlyAnnualized: number | null;
  // TTM 每股營收 = 近四季（含本季）營收加總 / 本季報告日對應的流通股數
  revenuePerShareTtm: number | null;

  operatingRevenue: {
    value: string | null; // BigInt as string；本季營收
  };
  operatingRevenueTtm: {
    value: string | null; // BigInt as string；近四季加總，資料不齊則為 null
  };

  paidInShares: {
    value: string | null; // BigInt as string
    // 股本資料的生效年月（西元曆），是「實際套用的那筆股本紀錄生效於何時」，不是本季的民國年季。
    effectiveYear: number | null;
    effectiveMonth: number | null;
  };

  ttm: {
    quartersUsed: string[];
    quartersMissing: string[];
  };

  fieldStatuses: Record<string, MetricStatus>;
  warnings: string[];
}
