import type { MetricResultMeta } from '@/shared/metricStatus';
import type { QuarterlyMetricQuery, QuarterlyMetricIdentity, QuarterlyMetricTtmInfo } from '@/shared/quarterlyMetric';
import type { PriceAnchorSource } from '@/shared/sourceData/reportAnnouncementDate';

// year/season 選填但要成對——不給就自動抓「這家公司現金流量表有資料」的最新一季
// （見 shared/sourceData/latestQuarter.ts），只給其中一個視為無效請求（在 controller 用 zod refine 擋掉）。
export type FcfYieldQuery = QuarterlyMetricQuery;

export interface FcfYieldResult extends QuarterlyMetricIdentity, MetricResultMeta {
  // FCF_Yield = 每股自由現金流 / 股價 x 100%。跟 P_FCF（valuation/pFcf/）互為倒數關係
  // （FCF_Yield = 1 / P_FCF x 100%），但這裡直接用每股數字對股價，不用重建市值/總額，
  // 也不需要流通股數，比 P_FCF 少一次查詢。
  fcfYieldQuarterlyAnnualizedPct: number | null;
  fcfYieldTtmPct: number | null;

  stockPrice: {
    value: number | null; // 元
    tradeDate: string | null; // YYYY-MM-DD；實際用到的股價交易日
    priceAnchorSource: PriceAnchorSource | null;
  };

  // 直接引用 cashFlowPerShare 已經算好的每股自由現金流（元），不重複查詢/計算。
  fcfPerShareQuarterlyAnnualized: number | null;
  fcfPerShareTtm: number | null;

  ttm: QuarterlyMetricTtmInfo;
}
