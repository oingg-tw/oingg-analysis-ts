import { z } from 'zod';

// 2026-09-05 新增——「產業追蹤」樹狀階層瀏覽功能，見
// src/shared/sourceData/industryClassification.ts 的說明。

export const industryLevelSchema = z.enum(['section', 'division', 'group', 'class', 'subclass']);

export const industryTreeChildSchema = z.object({
  code: z.string(),
  level: industryLevelSchema,
  name: z.string().nullable(),
  companyCount: z.number().meta({ description: '這個子節點（含所有子孫節點）底下總共幾家公司' }),
  hasChildren: z.boolean().meta({ description: 'subclass 層級一律是 false（沒有更細的層級）' }),
});

export const industryCompanyEntrySchema = z.object({
  symbol: z.string(),
  companyName: z.string().nullable(),
});

export const industryTreeNodeResultSchema = z.object({
  found: z.boolean().meta({ description: 'false 代表帶了 code 但查無此產業分類代碼；不給 code（查樹根）恆為 true' }),
  code: z.string().nullable().meta({ description: 'null 代表這是樹根（顯示全部 section）' }),
  level: industryLevelSchema.nullable(),
  name: z.string().nullable(),
  companyCount: z.number().meta({ description: '這個節點（含所有子孫節點）底下總共幾家公司；樹根時是全部已追蹤公司數' }),
  children: z.array(industryTreeChildSchema).meta({ description: '直屬子節點；subclass 層級這裡永遠是空陣列' }),
  companies: z.array(industryCompanyEntrySchema).meta({
    description:
      '精確分類在這個 code 的公司（不含子孫節點）。因為每家公司都分類到 subclass 這個最細層級，' +
      '非 subclass 層級這裡永遠是空陣列——請改看 companyCount 判斷這個分支底下大概有多少公司，展開到 subclass 才會看到實際公司名單。',
  }),
});
export type IndustryTreeNodeResult = z.infer<typeof industryTreeNodeResultSchema>;
