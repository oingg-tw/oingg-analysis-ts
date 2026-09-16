import { z } from 'zod';
import type { SecurityEntry, SecurityType } from '@/application/ports/companyProfiles';
import type { SecuritiesCountOnlyResult, SecuritiesListResult } from '@/application/securities/types';

// 2026-09-11 新增——跟 companies/types.ts 的 companiesListResultSchema/
// companiesCountOnlyResultSchema 同一組分頁形狀，但 entries 用 securityEntrySchema
// （多一個 type 欄位：COMMON/PREFERRED/ETF），不是 companies 那邊的 companyNameEntrySchema
// ——2026-09-11 應 bff-ts 要求新增 type，web-nuxt 要靠它做導頁判斷（普通股/特別股/ETF
// 詳情頁路由不同），見 companyProfile.ts 的 listAllSecurityNames 說明。
// 2026-09-17 Phase 4：entry schema 從 infrastructure 的 companyProfile.ts 搬來，型別真理來源是
// application/ports/companyProfiles.ts，這裡用 satisfies 釘住。

export const securityTypeSchema = z.enum(['COMMON', 'PREFERRED', 'ETF']) satisfies z.ZodType<SecurityType>;

// 跟 companyNameEntrySchema（GET /companies 用，沒有 type 概念）刻意分開一組 schema，不要為了共用把 type
// 塞成 optional 污染 companies 那邊的形狀。
export const securityEntrySchema = z.object({
  symbol: z.string(),
  companyName: z.string().nullable(),
  type: securityTypeSchema,
}) satisfies z.ZodType<SecurityEntry>;

export const securitiesListResultSchema = z.object({
  count: z.number().meta({ description: '全部證券總筆數（不受 limit/offset 影響）' }),
  limit: z.number(),
  offset: z.number(),
  entries: z.array(securityEntrySchema),
}) satisfies z.ZodType<SecuritiesListResult>;
export type { SecuritiesListResult };

export const securitiesCountOnlyResultSchema = z.object({
  count: z.number().meta({ description: '全部證券總筆數' }),
}) satisfies z.ZodType<SecuritiesCountOnlyResult>;
export type { SecuritiesCountOnlyResult };
