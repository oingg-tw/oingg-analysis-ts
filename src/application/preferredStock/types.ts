import type { YtcAssumption } from '@/domain/preferredStock/preferredStockYield';

// GET /preferred-stocks 的回應形狀（application 真理來源）——http/modules/preferredStock/types.ts 的 zod
// schema 用 satisfies 釘住。

// 2026-09-08 新增排序：只開放這幾個「使用者會想拿來排名」的數值/日期欄位，不是任意
// entry 欄位都能排——避免對 boolean/字串描述欄位（例如 redemptionConditions）做排序
// 這種沒有意義的操作，也讓 openapi 的可選值清楚列出來。命名沿用既有 etfScreener 的
// sortField/sortOrder 慣例。
export const PREFERRED_STOCK_SORTABLE_FIELDS = [
  'symbol',
  'issueDate',
  'listedDate',
  'issuePrice',
  'dividendRate',
  'nominalDividendRatePct',
  'currentYieldPct',
  'ytcPct',
  'ytwPct',
  'premiumRatePct',
] as const;
export type PreferredStockSortField = (typeof PREFERRED_STOCK_SORTABLE_FIELDS)[number];

export interface PreferredStockEntry {
  symbol: string;
  name: string;
  isinCode: string;
  listedDate: string;
  marketType: string;
  issueDate: string | null;
  issuePrice: number | null;
  dividendRate: number | null;
  nominalDividendRatePct: number | null;
  currentYieldPct: number | null;
  latestClosePrice: number | null;
  latestPriceDate: string | null;
  cumulativeDividend: boolean | null;
  participatingExcessDividend: boolean | null;
  liquidationPreference: boolean | null;
  votingRights: boolean | null;
  convertible: boolean | null;
  conversionStartDate: string | null;
  redeemable: boolean | null;
  redemptionDate: string | null;
  redemptionConditions: string | null;
  redemptionVerified: boolean | null;
  ytcPct: number | null;
  ytcAssumption: YtcAssumption | null;
  ytwPct: number | null;
  premiumRatePct: number | null;
}

export interface PreferredStockDataSource {
  name: string;
  url: string;
  note: string | null;
}

export interface PreferredStocksResult {
  count: number;
  limit: number;
  offset: number;
  dataSources: PreferredStockDataSource[];
  entries: PreferredStockEntry[];
}
