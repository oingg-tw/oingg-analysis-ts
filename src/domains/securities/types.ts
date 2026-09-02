// 2026-09-02 應使用者要求新增——「公司」（company_profile 完整登記範疇，見
// src/domains/companies/）跟「證券」（真正能交易的上市櫃標的）是兩個不同概念，這個分類專門
// 處理「這個代號算不算某種條件下的證券」這類查詢，不跟公司登記資料混在一起。
export interface SecuritySymbolsQuery {
  market?: 'TWSE' | 'TPEx';
  includeEmerging: boolean;
  excludeKy: boolean;
  // 查詢介面接受這兩個參數，但呼叫端如果傳了 true，回應的 warnings 會說明目前無效，不會
  // 靜默忽略，也不會因為傳了不支援的參數就整個請求 400。兩個的原因不一樣（見
  // src/shared/sourceData/companyProfile.ts 的說明）：excludeFullDelivery 是真的缺資料源
  // （等 mops-ts/tpex-ts），之後資料到位可以直接補篩選邏輯；excludePreferredStock 則是這份
  // 清單的底層資料本來就不含特別股，加篩選邏輯也不會改變結果，保留這個參數只是讓呼叫端不用
  // 猜「要不要自己排除特別股」。
  excludeFullDelivery: boolean;
  excludePreferredStock: boolean;
}

export interface SecuritySymbolsResult {
  count: number;
  symbols: string[];
  warnings: string[];
}
