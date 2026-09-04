// daily/indicatorRegistry.ts、quarterly/indicatorRegistry.ts 共用的型別——2026-09-05
// 從 indicatorRegistry.ts 抽出來，避免兩份 registry 互相 import 對方（daily 不該依賴
// quarterly 的檔案，反之亦然，兩組除了共用型別以外完全獨立）。

// 每個 result 都保證有的欄位——用來判斷這次呼叫「有沒有算出東西」，不用逐一解析每支指標
// 各自不同的 fieldStatuses/null 欄位規則（見 src/shared/metricStatus.ts 開頭說明：這個結構化
// 規範目前只套用在約一半的指標，另一半還是「null + warnings 純文字」，兩者唯一共同的欄位
// 就是 warnings）。
export interface IndicatorResult {
  warnings: string[];
}

export interface IndicatorJob {
  name: string; // 對應 filterCatalog metric key
  category: string; // 對應 filterCatalog category key，給完整度報告分組用
  getCompanyIds: () => Promise<string[]>;
  run: (symbol: string) => Promise<IndicatorResult>;
}
