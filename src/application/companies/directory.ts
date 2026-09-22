import { NotFoundError } from '@/application/errors';
import type { AppDeps } from '@/application/deps';
import type { CompanyNameEntry } from '@/application/ports/companyProfiles';
import type { CompanyProfileDetail } from './types';

// 2026-09-17 Phase 4：從 http/modules/companies/companyDirectoryController.ts 搬來，邏輯逐字不變。
export type CompanyDirectoryDeps = Pick<AppDeps, 'companyProfiles' | 'reportAvailability'>;

export interface ListCompaniesQuery {
  limit: number;
  offset: number;
  countOnly: boolean;
}

// 2026-09-01 應 bff-ts 要求新增的 GET /companies 兩種回應形狀（依 countOnly 決定回哪一種）。
export interface CompaniesListResult {
  count: number; // 全部公司總筆數（不受 limit/offset 影響）
  limit: number;
  offset: number;
  entries: CompanyNameEntry[];
}

export interface CompaniesCountOnlyResult {
  count: number;
}

export const listCompanies = async (query: ListCompaniesQuery, deps: CompanyDirectoryDeps): Promise<CompaniesListResult | CompaniesCountOnlyResult> => {
  if (query.countOnly) {
    const count = await deps.companyProfiles.countAllCompanyNames();
    return { count };
  }

  const { count, entries } = await deps.companyProfiles.listAllCompanyNames(query.limit, query.offset);
  return { count, limit: query.limit, offset: query.offset, entries };
};

// 上市（TWSE）查無資料再查上櫃（TPEx），兩邊都查無資料丟 NotFoundError → 404，body 跟以前 controller 手寫的一樣。
export const getCompanyProfile = async (symbol: string, deps: CompanyDirectoryDeps): Promise<CompanyProfileDetail> => {
  const profile = await deps.companyProfiles.getCompanyProfileDetail(symbol);
  if (!profile) throw new NotFoundError(`找不到公司代號 ${symbol}。`);
  return { ...profile, metricDataType: await deps.reportAvailability.resolveDataType(symbol) };
};
