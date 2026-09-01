// bff-ts 的直連 DB 反模式修復計畫最後一塊：他們原本直接對本服務的 DB 跑動態 CTE/JOIN，
// 換成呼叫這兩支 API。介面形狀照他們現有對外契約設計（前端不用改）。

export interface ScreenerFilterInput {
  field: string; // "<metricKey>.<fieldKey>"，要能透過 metricTableRegistry.resolveField 解析
  min: number | null;
  max: number | null;
  /** 預設 false：保留落在 [min, max] 內的值；true：保留落在 [min, max] 外的值。
   *  值本身是 null 一律排除，不管 exclude 是哪個方向。 */
  exclude?: boolean;
}

export interface ScreenerColumnInput {
  field: string;
}

export interface ScreenerRequest {
  filters: ScreenerFilterInput[];
  columns: ScreenerColumnInput[];
  page?: number;
  pageSize?: number;
}

export interface ScreenerValue {
  value: number | null;
  asOfDate: string | null;
}

export interface ScreenerRow {
  symbol: string;
  values: Record<string, ScreenerValue>;
}

export interface ScreenerResponse {
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
  results: ScreenerRow[];
}

export interface ScreenerRankingRequest {
  field: string;
  direction: 'asc' | 'desc';
  limit: number;
  columns: string[];
}

export interface ScreenerRankingResponse {
  results: ScreenerRow[];
}
