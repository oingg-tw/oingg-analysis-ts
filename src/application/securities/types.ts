import type { SecurityEntry } from '@/application/ports/companyProfiles';

// GET /securities 兩種回應形狀（依 countOnly 決定回哪一種）——http/modules/securities/types.ts 的 zod schema
// 用 satisfies 釘住。
export interface SecuritiesListResult {
  count: number;
  limit: number;
  offset: number;
  entries: SecurityEntry[];
}

export interface SecuritiesCountOnlyResult {
  count: number;
}
