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

export const industryPathNodeSchema = z.object({
  code: z.string(),
  level: industryLevelSchema,
  name: z.string().nullable(),
});

export const industryFlatCompanySchema = z.object({
  symbol: z.string(),
  companyName: z.string().nullable(),
  path: z.array(industryPathNodeSchema).meta({ description: '由粗到細排序：section -> division -> group -> class -> subclass' }),
});

export const industryFlatResultSchema = z.object({
  companies: z.array(industryFlatCompanySchema),
});
export type IndustryFlatResult = z.infer<typeof industryFlatResultSchema>;

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

// 2026-09-09 新增——tpex-ts 開的產業價值鏈分類（ic.tpex.org.tw），跟上面財政部稅籍分類是
// 完全不同的體系（2 層 industry/subChain，一家公司可對應多個 subChain，涵蓋上市/上櫃/興櫃
// 三個市場），刻意獨立一組 schema，不跟 industryLevelSchema/industryTreeNodeResultSchema 共用。

export const valueChainLevelSchema = z.enum(['industry', 'subChain']);

export const valueChainChildSchema = z.object({
  code: z.string(),
  name: z.string().nullable(),
  companyCount: z.number().meta({ description: '這個節點底下總共幾家公司（不重複計算 symbol）' }),
});

export const valueChainCompanyEntrySchema = z.object({
  symbol: z.string(),
  companyName: z.string().nullable(),
  market: z.enum(['listed', 'otc', 'rotc']).meta({ description: '上市/上櫃/興櫃' }),
});

export const valueChainNodeResultSchema = z.object({
  found: z.boolean().meta({ description: 'false 代表帶了 code 但查無此產業價值鏈代碼；不給 code（查樹根）恆為 true' }),
  code: z.string().nullable().meta({ description: 'null 代表這是樹根（顯示全部一級產業）' }),
  level: valueChainLevelSchema.nullable(),
  name: z.string().nullable(),
  children: z.array(valueChainChildSchema).meta({ description: '直屬子節點；subChain 層級這裡永遠是空陣列' }),
  companies: z.array(valueChainCompanyEntrySchema).meta({
    description: '精確對應在這個 code 的公司。只有 subChain 層級會有值，industry/樹根層級永遠是空陣列（一家公司可能同時屬於多個 subChain，不做加總去重的「含子孫」公司數，請直接展開到 subChain 層級查看）。',
  }),
  dataSource: z.string().meta({ description: '公開可查證的原始資料來源網址，不是內部服務/table 名稱' }),
});
export type ValueChainNodeResult = z.infer<typeof valueChainNodeResultSchema>;
