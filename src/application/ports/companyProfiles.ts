import type { CompanyProfileDetail } from '@/application/companies/types';

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
  getCompanyProfileDetail(symbol: string): Promise<CompanyProfileDetail | null>;
  listAllCompanyNames(limit: number, offset: number): Promise<{ count: number; entries: CompanyNameEntry[] }>;
  countAllCompanyNames(): Promise<number>;
  listAllSecurityNames(limit: number, offset: number): Promise<{ count: number; entries: SecurityEntry[] }>;
  countAllSecurityNames(): Promise<number>;
}
