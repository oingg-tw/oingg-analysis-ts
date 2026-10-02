// 產業參考資料 port——證交所類股（company_profile.industry，扁平兩碼代碼）：screener 的類股篩選來源、類股瀏覽。
// 實作在 infrastructure/cache/industryReferenceData.ts。
// 2026-10-02 gov-ts 財政部稅籍五層分類的樹狀瀏覽＋攤平路徑（GET /industries/tree、/flat）已下架，對應 port 方法移除。
// 各 repository 檔案內部仍保有同形狀的型別定義（快取建構用），port 物件綁定時由 tsc 做結構比對，兩邊漂掉會編譯失敗。
//
// 2026-09-20 使用者要求完全捨棄 playwright-py 供應鏈分類（合規考量：來源真實性/更新機制不明，見
// project_open_data_legal_audit_2026_09.md）——原本這裡第三套分類體系（公司產業標籤/聚落分群/
// 逐層瀏覽樹）連同 GET /companies/peer-group、GET /industries/chain-{classification,clusters,tree}
// 三支端點一併移除，不是降級或改資料源，是整個功能捨棄。

export interface SecuritiesIndustrySector {
  code: string;
  name: string;
  companyCount: number;
}

export interface IndustryReferenceDataPort {
  // ---- 證交所類股（company_profile.industry 兩碼代碼；代碼字典是啟動快取，公司清單查 DB）
  listSecuritiesIndustrySectors(): Promise<SecuritiesIndustrySector[]>;
  // 字典裡有、且不是 XX/98/91/07 這種非產業代碼。
  isValidSecuritiesSectorCode(code: string): boolean;
  // 屬於這些類股代碼（聯集）的全部上市櫃公司 symbol。
  listCompaniesBySectorCodes(codes: string[]): Promise<Set<string>>;
}
