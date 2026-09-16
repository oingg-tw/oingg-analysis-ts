export interface ScreenerFilterInput {
  field: string; // "metricCode.basis"，例如 "roe.TTM"
  min: number | null;
  max: number | null;
  exclude?: boolean;
}

export interface ScreenerColumnInput {
  field: string;
}

// 'missing_input' | 'zero_or_negative_denominator' | 'not_applicable_industry' | 'insufficient_history'，
// 完整說明見 src/domainPitMetrics/metricBasis.ts 的 metricNullReasonSchema。
export type ScreenerNullReason = 'missing_input' | 'zero_or_negative_denominator' | 'not_applicable_industry' | 'insufficient_history';

export interface ScreenerValue {
  value: number | null;
  // 2026-09-13 改名（asOfDate→knowledgeDate）：跟 GET /companies/metric-history 等其餘
  // PIT 端點統一用語——同一個底層欄位（knowledge_date），screener 系列原本自己另外取名
  // asOfDate，是唯一的例外，違反 ubiquitous language（見 resolveKnowledgeDate 的說明）。
  // 注意這是輸出欄位，跟專案裡其餘「asOfDate 當輸入參數」（例如 getStockPriceAsOf）是
  // 不同、正確的用法，不要混為一談。
  knowledgeDate: string | null; // YYYY-MM-DD，value 為 null 時也是 null
  // 2026-09-13 新增：value 為 null 時的原因，value 非 null 時一律是 null——跟
  // GET /companies/metric-history 的 nullReason 同一套語意/列舉值，讓 screener 系列端點
  // （POST /screener、GET /screener/ranking、POST /screener/values）跟 metric-history 一致，
  // 不用只顯示籠統的「查無資料」。查無這一列（symbol 完全沒被算過這支指標）時也是 null，
  // 呼叫端無法單靠這個欄位分辨「算過但為 null」跟「根本沒算過」，需要精確分辨時應改查
  // GET /companies/metric-history（entries 陣列本身有沒有那一筆）。
  nullReason: ScreenerNullReason | null;
}

export interface ScreenerRow {
  symbol: string;
  companyName: string | null;
  values: Record<string, ScreenerValue>;
}

export interface ScreenerResponse {
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
  results: ScreenerRow[];
}

export interface ScreenerRankingResponse {
  results: ScreenerRow[];
}

export interface CompanyRankResult {
  symbol: string;
  field: string; // "metricCode.basis"，跟請求時給的字串一致
  found: boolean; // false 代表這家公司這個欄位查無資料（從沒被算過或算出來是 null），此時其餘欄位皆為 null
  value: number | null;
  rank: number | null; // 1-based，並列名次共用同一個 rank（RANK() 語意，不是 ROW_NUMBER()）
  totalCount: number | null; // 全市場這個欄位有值（非 null）的公司總數
  topPercent: number | null; // rank÷totalCount×100，數字越小代表排名越前面，例如 5 代表排在全市場前 5%
}
