import { z } from 'zod';
import { companyNameEntrySchema } from '@/shared/sourceData/companyProfile';

// 2026-09-11 新增——跟 companies/types.ts 的 companiesListResultSchema/
// companiesCountOnlyResultSchema 同一組形狀，共用 companyNameEntrySchema（都是
// {symbol, companyName} 配對），差別只在資料範疇是「證券」不是「公司」，見
// companyProfile.ts 的 listAllSecurityNames 說明。

export const securitiesListResultSchema = z.object({
  count: z.number().meta({ description: '全部證券總筆數（不受 limit/offset 影響）' }),
  limit: z.number(),
  offset: z.number(),
  entries: z.array(companyNameEntrySchema),
});
export type SecuritiesListResult = z.infer<typeof securitiesListResultSchema>;

export const securitiesCountOnlyResultSchema = z.object({
  count: z.number().meta({ description: '全部證券總筆數' }),
});
export type SecuritiesCountOnlyResult = z.infer<typeof securitiesCountOnlyResultSchema>;
