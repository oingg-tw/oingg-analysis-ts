// 2026-09-02 應使用者要求新增——「公司」（company_profile 完整登記範疇，見
// src/domains/companies/）跟「證券」（真正能交易的上市櫃標的）是兩個不同概念，這個分類專門
// 處理「這個代號算不算某種條件下的證券」這類查詢，不跟公司登記資料混在一起。
export interface SecuritySymbolsQuery {
  market?: 'TWSE' | 'TPEx';
  includeEmerging: boolean;
  excludeKy: boolean;
  // 不給就股票+特別股都要；'only' 只要特別股，'exclude' 排除特別股。特別股資料源是 twse-ts
  // 的 export.isin_securities，目前只有 TWSE（見 companyProfile.ts 的說明），
  // market=TPEx + preferredStock=only 這個組合現在一定回空陣列。
  preferredStock?: 'only' | 'exclude';
  // 全額交割排除目前技術上做不到（等 mops-ts/tpex-ts 的資料集），查詢介面先接受這個參數，
  // 傳了不會 400、也不會靜默忽略——回應的 warnings 會說明目前無效，之後資料到位直接補
  // 篩選邏輯，呼叫端不用改介面。
  excludeFullDelivery: boolean;
}

export interface SecuritySymbolsResult {
  count: number;
  symbols: string[];
  warnings: string[];
}
