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
  /** "symbol" 或已經列在 columns 裡的 "metricKey.fieldKey"——2026-09-01 應 bff-ts 要求新增。
   *  沒給就照舊用 symbol 由小到大排序（保證分頁穩定，不是「沒有排序」）。目前不支援排公司名稱
   *  （company_profile 在 twse/tpex，不是本服務的 DB，screener 引擎沒有跨資料庫 JOIN 的機制）。 */
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
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
