import { z } from 'zod';
import { securityEntrySchema } from '@/shared/sourceData/companyProfile';

// 2026-09-11 新增——跟 companies/types.ts 的 companiesListResultSchema/
// companiesCountOnlyResultSchema 同一組分頁形狀，但 entries 用 securityEntrySchema
// （多一個 type 欄位：COMMON/PREFERRED/ETF），不是 companies 那邊的 companyNameEntrySchema
// ——2026-09-11 應 bff-ts 要求新增 type，web-nuxt 要靠它做導頁判斷（普通股/特別股/ETF
// 詳情頁路由不同），見 companyProfile.ts 的 listAllSecurityNames 說明。

export const securitiesListResultSchema = z.object({
  count: z.number().meta({ description: '全部證券總筆數（不受 limit/offset 影響）' }),
  limit: z.number(),
  offset: z.number(),
  entries: z.array(securityEntrySchema),
});
export type SecuritiesListResult = z.infer<typeof securitiesListResultSchema>;

export const securitiesCountOnlyResultSchema = z.object({
  count: z.number().meta({ description: '全部證券總筆數' }),
});
export type SecuritiesCountOnlyResult = z.infer<typeof securitiesCountOnlyResultSchema>;
