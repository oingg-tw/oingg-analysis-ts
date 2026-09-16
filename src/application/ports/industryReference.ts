// 產業參考資料 port——三套互不相容的產業分類體系，全部是伺服器啟動時載入一次的記憶體快取（同步讀取），
// 只有證交所類股那支要查 DB：
// - gov-ts 財政部稅籍五層分類（section/division/group/class/subclass）：產業追蹤樹狀瀏覽 + 攤平路徑。
// - playwright-py 供應鏈分類：公司產業標籤（category/coarseGroup）、聚落分群（cluster）、逐層瀏覽樹（chain tree）。
// - 證交所類股（company_profile.industry，40 個扁平代碼）：screener 的 industryCodes 篩選來源。
// 實作在 infrastructure/cache/industryReferenceData.ts（組合 gov/playwright/exchange 三處 repository 的存取器）。
// 各 repository 檔案內部仍保有同形狀的型別定義（快取建構用），port 物件綁定時由 tsc 做結構比對，兩邊漂掉會編譯失敗。

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

export interface CompanyCategoryListEntry {
  symbol: string;
  category: string | null;
  coarseGroup: string | null;
  source: 'keyword' | 'gemini' | null;
  updatedAt: Date | null;
}

export interface CategoryGroupListEntry {
  coarseGroup: string;
  fineCategories: string[];
}

export interface ClusterSubGroup {
  subClusterId: number;
  subLabel: string | null;
  memberCodes: string[];
}

export interface ClusterNode {
  clusterId: number;
  label: string | null;
  metaGroup: string | null; // 細聚落收斂成的粗分組，組數會隨資料源調整持續變動
  directMemberCodes: string[]; // 沒有再切子聚落的直屬成員
  subClusters: ClusterSubGroup[];
}

export interface ExternalCompanyEntry {
  nameZh: string | null;
  nameEn: string | null;
}

export type IndustryChainTreeNodeType = 'coarse_group' | 'category' | 'segment' | 'misc';

export interface IndustryChainTreeNode {
  nodeId: string;
  nodeType: IndustryChainTreeNodeType;
  label: string | null;
  depth: number;
  size: number | null;
  children: IndustryChainTreeNode[];
  memberSymbols: string[]; // 只有葉節點（沒有 children）才有成員，其餘節點恆為 []
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
  // ---- playwright-py 供應鏈分類
  listAllCompanyCategories(): CompanyCategoryListEntry[];
  listCategoryGroups(): CategoryGroupListEntry[];
  listIndustryClusters(): ClusterNode[];
  getExternalCompanyName(code: string): ExternalCompanyEntry | undefined;
  listIndustryTree(): IndustryChainTreeNode[];
  // ---- 證交所類股
  listSecuritiesIndustrySectors(): Promise<SecuritiesIndustrySector[]>;
}
