import type { AppDeps } from '@/application/deps';
import type { SecuritiesCountOnlyResult, SecuritiesListResult } from './types';

export interface ListSecuritiesQuery {
  limit: number;
  offset: number;
  countOnly: boolean;
}

// 2026-09-11 應 web-nuxt 要求新增——「公司」（GET /companies，company_profile 完整登記
// 範疇）跟「證券」（真正能交易的標的，含特別股）是刻意分開的兩個概念，不共用同一支端點，
// 見 companyProfile.ts 的 listAllSecurityNames 說明。上限/預設值跟 GET /companies 一致。
export const listSecurities = async (query: ListSecuritiesQuery, deps: Pick<AppDeps, 'companyProfiles'>): Promise<SecuritiesListResult | SecuritiesCountOnlyResult> => {
  if (query.countOnly) {
    const count = await deps.companyProfiles.countAllSecurityNames();
    return { count };
  }

  const { count, entries } = await deps.companyProfiles.listAllSecurityNames(query.limit, query.offset);
  return { count, limit: query.limit, offset: query.offset, entries };
};
