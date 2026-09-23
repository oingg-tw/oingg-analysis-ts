import type { ExchangeCompanyProfileDetail } from '@/application/companies/types';

// 公司/證券基本資料 port（twse-ts/tpex-ts 兩邊的 company_profile + sitca 的 ETF 清單）——GET /companies、
// GET /securities、以及所有「把 symbol 補上公司名稱」的排行/清單端點都靠它。實作在
// infrastructure/repositories/exchange/companyProfile.ts。

export interface SecuritySymbolsFilter {
  market?: 'TWSE' | 'TPEx'; // 不給就兩個市場都要
  includeEmerging?: boolean; // 預設 true——興櫃算真正公司
  excludeKy?: boolean; // 預設 false——KY 股是合法上市公司，不是衍生商品，預設不排除
  preferredStock?: 'only' | 'exclude'; // 不給就兩種都要（股票+特別股混在一起）
  excludeFullDelivery?: boolean; // 全額交割股，TWSE/TPEx 判斷方式不同，repository 統一處理
}

export interface CompanyNameEntry {
  symbol: string;
  companyName: string | null;
  // 2026-09-19 應 web-nuxt SEO hub 頁需求新增（/stock 總表、/industry/{sector} 要一次拿到全市場每檔的
  // 類股跟市場，2,600 檔逐一打 profile 不可行）。market 依資料來源 DB 決定（twse-ts=TWSE、tpex-ts=TPEx）；
  // sectorCode/sectorName 是證交所類股分類（company_profile.industry，跟 GET /industries/securities-sectors
  // 同一套 36 個代碼與名稱），公司掛在「非產業」的代碼（07/91/98/XX，見 companyProfile.ts 的
  // NON_INDUSTRY_CODES）時兩者皆為 null，跟 securities-sectors 排除那幾個代碼的規則一致。
  market: 'TWSE' | 'TPEx';
  sectorCode: string | null;
  sectorName: string | null;
  // 2026-09-23 新增：這個目錄**刻意包含興櫃**（使用者裁定），所以下游必須有辦法分辨。
  // 興櫃只存在於 TPEx 那側（tpex-ts 的 company_profile 用 source 區分：COMPANY_PROFILE 上櫃 891 家、
  // COMPANY_PROFILE_EMERGING 興櫃 364 家）；TWSE 側恆為 false。判斷邏輯跟 listSecuritySymbols
  // 的 isEmerging 同一套，不另外發明。
  //
  // 為什麼重要：興櫃公司**沒有月營收強制揭露**，所以 SUS 這類依賴月營收的指標對它們永遠是空的；
  // 上游（mops-ts/twse-ts/tpex-ts）的「全市場」清單也一律指上市＋上櫃 1,985 家、不含興櫃。
  // 下游拿這個目錄當母體算覆蓋率時，要先扣掉 isEmerging 才會跟上游的數字對得起來。
  isEmerging: boolean;
}

// 普通股/特別股/ETF——web-nuxt 靠這個做導頁判斷，不靠 symbol 格式猜。
export type SecurityType = 'COMMON' | 'PREFERRED' | 'ETF';

export interface SecurityEntry {
  symbol: string;
  companyName: string | null;
  type: SecurityType;
}

export interface CompanyProfilePort {
  // 查不到的 symbol 值是 null（Map 裡仍有 key），一次查一批避免 N+1。
  getCompanyNamesForSymbols(symbols: string[]): Promise<Map<string, string | null>>;
  getSecuritySymbolSet(filter: SecuritySymbolsFilter): Promise<Set<string>>;
  companyExists(symbol: string): Promise<boolean>;
  getCompanyProfileDetail(symbol: string): Promise<ExchangeCompanyProfileDetail | null>;
  listAllCompanyNames(limit: number, offset: number): Promise<{ count: number; entries: CompanyNameEntry[] }>;
  countAllCompanyNames(): Promise<number>;
  listAllSecurityNames(limit: number, offset: number): Promise<{ count: number; entries: SecurityEntry[] }>;
  countAllSecurityNames(): Promise<number>;
}
