import type { Season } from '@/shared/rocQuarter';
import type { MetricStatus } from '@/shared/metricStatus';
import type { PriceAnchorSource } from '@/shared/sourceData/reportAnnouncementDate';

export interface PsrQuery {
  companyId: string;
  // year/season 選填但要成對——不給就自動抓「這家公司損益表有資料」的最新一季
  // （見 shared/sourceData/latestQuarter.ts），只給其中一個視為無效請求（在 controller 用 zod refine 擋掉）。
  year?: string;
  season?: Season;
  dataType: '1' | '2'; // 1 = 個體, 2 = 合併
  subsidiaryCompanyId: string;
}

export interface PsrResult {
  companyId: string;
  // 實際使用的季度（不論是查詢時指定的，還是自動抓最新的）；查無任何季度資料時為 null。
  year: string | null;
  season: Season | null;
  dataType: '1' | '2';
  subsidiaryCompanyId: string;
  reportDate: string | null;

  // PSR = 市值（存量） / 營收（流量）——跟 netDebtToEbitda 同一種道理，拿市值除以「一季」的營收
  // 沒有標準意義，只提供本季營收簡單年化（x4）跟近四季實際加總（TTM）兩種口徑，沒有純單季版本。
  psrQuarterlyAnnualized: number | null;
  psrTtm: number | null;

  marketCap: {
    value: number | null; // 元；股價（基準日見下方）x 流通股數
    tradeDate: string | null; // YYYY-MM-DD；實際用到的股價交易日
    priceAnchorSource: PriceAnchorSource | null;
  };

  operatingRevenue: {
    value: string | null; // BigInt as string；本季營收（千元）
  };
  operatingRevenueTtm: {
    value: string | null; // BigInt as string；近四季加總（千元），資料不齊則為 null
  };

  ttm: {
    quartersUsed: string[];
    quartersMissing: string[];
  };

  fieldStatuses: Record<string, MetricStatus>;
  warnings: string[];
}
