import type { Season } from '@/shared/rocQuarter';
import type { MetricStatus } from '@/shared/metricStatus';
import type { PriceAnchorSource } from '@/shared/sourceData/reportAnnouncementDate';

export interface EvEbitdaQuery {
  symbol: string;
  // year/season 選填但要成對——不給就自動抓「這家公司資產負債表/損益表/現金流量表都有資料」的
  // 最新一季（見 shared/sourceData/latestQuarter.ts），只給其中一個視為無效請求（在 controller 用 zod refine 擋掉）。
  year?: string;
  season?: Season;
  dataType: '1' | '2'; // 1 = 個體, 2 = 合併
  subsidiaryCompanyId: string;
}

export interface EvEbitdaResult {
  symbol: string;
  // 實際使用的季度（不論是查詢時指定的，還是自動抓最新的）；查無任何季度資料時為 null。
  year: string | null;
  season: Season | null;
  dataType: '1' | '2';
  subsidiaryCompanyId: string;
  reportDate: string | null;

  // EV_EBITDA = 企業價值 / EBITDA。企業價值、EBITDA 都是流量/存量各半的組合，拿企業價值除以
  // 「一季」的 EBITDA 沒有標準意義，只提供本季 EBITDA 簡單年化（x4）跟近四季實際加總（TTM）
  // 兩種口徑，沒有純單季版本——跟 PSR/P_FCF/netDebtToEbitda 同一種道理。
  evToEbitdaQuarterlyAnnualized: number | null;
  evToEbitdaTtm: number | null;

  // 企業價值 = 市值 + 淨負債（本季期末，可能是負數代表淨現金部位，此時 EV 會小於市值）。
  enterpriseValue: {
    value: number | null; // 元
  };

  marketCap: {
    value: number | null; // 元；股價（基準日見下方）x 流通股數
    tradeDate: string | null; // YYYY-MM-DD；實際用到的股價交易日
    priceAnchorSource: PriceAnchorSource | null;
  };

  netDebt: {
    value: string | null; // BigInt as string（千元）；本季期末：有息負債 - 現金及約當現金
  };
  ebitdaQuarterly: {
    value: string | null; // BigInt as string（千元）；本季 EBITDA = EBIT + 折舊 + 攤銷
  };
  ebitdaTtm: {
    value: string | null; // BigInt as string（千元）；近四季加總，資料不齊則為 null
  };

  ttm: {
    quartersUsed: string[];
    quartersMissing: string[];
  };

  fieldStatuses: Record<string, MetricStatus>;
  warnings: string[];
}
