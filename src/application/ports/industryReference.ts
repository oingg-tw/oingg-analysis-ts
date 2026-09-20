// 產業參考資料 port——兩套互不相容的產業分類體系，全部是伺服器啟動時載入一次的記憶體快取（同步讀取），
// 只有證交所類股那支要查 DB：
// - gov-ts 財政部稅籍五層分類（section/division/group/class/subclass）：產業追蹤樹狀瀏覽 + 攤平路徑。
// - 證交所類股（company_profile.industry，40 個扁平代碼）：screener 的 industryCodes 篩選來源。
// 實作在 infrastructure/cache/industryReferenceData.ts（組合 gov/exchange 兩處 repository 的存取器）。
// 各 repository 檔案內部仍保有同形狀的型別定義（快取建構用），port 物件綁定時由 tsc 做結構比對，兩邊漂掉會編譯失敗。
//
// 2026-09-20 使用者要求完全捨棄 playwright-py 供應鏈分類（合規考量：來源真實性/更新機制不明，見
// project_open_data_legal_audit_2026_09.md）——原本這裡第三套分類體系（公司產業標籤/聚落分群/
// 逐層瀏覽樹）連同 GET /companies/peer-group、GET /industries/chain-{classification,clusters,tree}
// 三支端點一併移除，不是降級或改資料源，是整個功能捨棄。

export type IndustryLevel = 'section' | 'division' | 'group' | 'class' | 'subclass';

export interface IndustryNodeInfo {
  code: string | null; // null = 樹根
  level: IndustryLevel | null;
  name: string | null;
  companyCount: number; // 含所有子孫節點的公司數加總
}

export interface IndustryTreeChildSummary {
  code: string;
  level: IndustryLevel;
  name: string | null;
  companyCount: number;
  hasChildren: boolean; // subclass 層級一律是 false
}

export interface IndustryPathNode {
  code: string;
  level: IndustryLevel;
  name: string | null;
}

export interface CompanyIndustryPath {
  symbol: string;
  path: IndustryPathNode[]; // 由粗到細排序（section -> ... -> subclass），不含 null 層級
}

export interface SecuritiesIndustrySector {
  code: string;
  name: string;
  companyCount: number;
}

export interface IndustryReferenceDataPort {
  // ---- gov-ts 稅籍五層分類（純瀏覽語意，不做動態層級回退）
  // code=null 代表樹根，一定回傳成功；code 給了但字典查無此代碼回 null（呼叫端轉 found:false）。
  getIndustryNodeInfo(code: string | null): IndustryNodeInfo | null;
  // 直屬子節點；code=null 回傳全部 section；subclass 或查無代碼回 []。
  listIndustryChildren(code: string | null): IndustryTreeChildSummary[];
  // 精確分類在這個 code 的公司（只有 subclass 層級才有）。
  listIndustryCompanies(code: string): string[];
  listAllCompanyIndustryPaths(): CompanyIndustryPath[];
  // ---- 證交所類股（company_profile.industry 兩碼代碼；代碼字典是啟動快取，公司清單查 DB）
  listSecuritiesIndustrySectors(): Promise<SecuritiesIndustrySector[]>;
  // 字典裡有、且不是 XX/98/91/07 這種非產業代碼。
  isValidSecuritiesSectorCode(code: string): boolean;
  // 屬於這些類股代碼（聯集）的全部上市櫃公司 symbol。
  listCompaniesBySectorCodes(codes: string[]): Promise<Set<string>>;
}
