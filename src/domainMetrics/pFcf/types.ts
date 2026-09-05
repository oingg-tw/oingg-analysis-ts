import type { MetricResultMeta } from '@/shared/metricStatus';
import type { QuarterlyMetricQuery, QuarterlyMetricIdentity, QuarterlyMetricTtmInfo } from '@/shared/quarterlyMetric';
import type { PriceAnchorSource } from '@/shared/sourceData/reportAnnouncementDate';

// year/season 選填但要成對——不給就自動抓「這家公司現金流量表有資料」的最新一季
// （見 shared/sourceData/latestQuarter.ts），只給其中一個視為無效請求（在 controller 用 zod refine 擋掉）。
export type PFcfQuery = QuarterlyMetricQuery;

export interface PFcfResult extends QuarterlyMetricIdentity, MetricResultMeta {
  // P_FCF = 市值（存量） / 自由現金流（流量）——跟 PSR/netDebtToEbitda 同一種道理，只提供
  // 本季 FCF 簡單年化（x4）跟近四季實際加總（TTM）兩種口徑，沒有純單季版本。
  pFcfQuarterlyAnnualized: number | null;
  pFcfTtm: number | null;

  marketCap: {
    value: number | null; // 元；股價（基準日見下方）x 流通股數
    tradeDate: string | null; // YYYY-MM-DD；實際用到的股價交易日
    priceAnchorSource: PriceAnchorSource | null;
  };

  // FCF = 營業活動現金流量 + 資本支出（capitalExpenditures 在資料庫裡本來就是負數）。
  freeCashFlow: {
    value: string | null; // BigInt as string；本季 FCF（千元）
  };
  freeCashFlowTtm: {
    value: string | null; // BigInt as string；近四季加總（千元），資料不齊則為 null
  };

  ttm: QuarterlyMetricTtmInfo;
}
