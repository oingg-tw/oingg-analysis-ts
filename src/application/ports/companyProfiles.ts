import type { MarketCode } from '@/domain/market/marketCode';
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
  // 類股跟市場，2,600 檔逐一打 profile 不可行）。sectorCode/sectorName 是證交所類股分類（跟 GET /industries/securities-sectors
  // 同一套代碼與名稱），公司掛在「非產業」的代碼（07/91/98/XX，見 companyProfile.ts 的 NON_INDUSTRY_CODES）時兩者皆為 null。
  //
  // market 是 MOPS TYPEK（domain/market/marketCode.ts）：sii 上市、otc 上櫃、rotc 興櫃。2026-10-11 取代舊的
  // market 'TWSE'|'TPEx'＋isEmerging 旗標（詞彙表改名，使用者決定提前結束並存期）。
  // 這個目錄**刻意包含興櫃**（2026-09-23 使用者裁定，全部在 tpex 側）。興櫃**沒有月營收強制揭露**，SUS 這類依賴
  // 月營收的指標對它們永遠是空的；上游（mops-ts/twse-ts/tpex-ts）的「全市場」也一律指上市＋上櫃、不含興櫃，
  // 下游拿這個目錄當母體算覆蓋率時要先扣掉 market='rotc' 才會跟上游的數字對得起來。
  market: MarketCode;
  sectorCode: string | null;
  sectorName: string | null;
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
  // GET /securities 標成 ETF 的那批代號（sitca etf_basic_info），給除權息日曆判斷 securityType。
  listEtfSymbols(): Promise<Set<string>>;
}
