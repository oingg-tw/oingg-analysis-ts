export interface DataCompletenessQuery {
  symbol: string;
}

// ok：呼叫成功、沒有任何 warnings（資料齊全，算出來的每個欄位都有值）。
// partial：呼叫成功，但有 warnings（部分欄位 no_data/not_applicable，優雅降級過的正常情境）。
// unavailable：呼叫本身丟例外——理論上不該發生（每支指標的 service.ts 都該優雅降級成
// null + warnings，不是丟例外），出現代表可能是真的異常，不是單純缺資料。
export type IndicatorAvailability = 'ok' | 'partial' | 'unavailable';

export interface IndicatorCompleteness {
  key: string; // 對應 filterCatalog metric key
  status: IndicatorAvailability;
  warnings: string[];
}

export interface CategoryCompleteness {
  total: number;
  ok: number;
  partial: number;
  unavailable: number;
  completenessPct: number; // ok ÷ total，四捨五入到小數 2 位
  indicators: IndicatorCompleteness[];
}

export interface DataCompletenessResult {
  symbol: string;
  totalIndicators: number;
  overallCompletenessPct: number; // 全部 44 支指標裡 ok 的比例
  categories: Record<string, CategoryCompleteness>; // key 對應 filterCatalog category key
}
