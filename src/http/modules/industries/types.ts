import { z } from 'zod';
import type { IndustryLevel } from '@/application/ports/industryReference';
import type { IndustryFlatResult, IndustryTreeNodeResult, SecuritiesIndustrySectorsResult } from '@/application/industries/types';

// 2026-09-05 新增——「產業追蹤」樹狀階層瀏覽功能，見
// infrastructure/repositories/gov/industryClassification.ts 的說明。
// 2026-09-17 Phase 4：形狀的真理來源是 application/industries/types.ts 的介面，這裡用 satisfies 釘住。
// 2026-09-20 使用者要求完全捨棄 playwright-py 供應鏈分類，原本這裡的
// chainClassification*/chainCluster*/industryTree* schema（對應已刪除的 GET /industries/
// chain-{classification,clusters,tree} 三支端點）已移除。

export const industryLevelSchema = z.enum(['section', 'division', 'group', 'class', 'subclass']) satisfies z.ZodType<IndustryLevel>;

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
}) satisfies z.ZodType<IndustryFlatResult>;
export type { IndustryFlatResult };

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
}) satisfies z.ZodType<IndustryTreeNodeResult>;
export type { IndustryTreeNodeResult };

// 2026-09-11 新增——證交所類股分類（twse-ts/tpex-ts company_profile.industry，投資人習慣
// 的「半導體業」「電子零組件業」這種類股），跟上面財政部稅籍五層分類/tpex-ts 產業價值鏈都是
// 完全不同的體系：只有單一層級（不是樹狀），40 個代碼扁平列出，刻意獨立一組 schema。

export const securitiesIndustrySectorSchema = z.object({
  code: z.string().meta({ description: '兩碼證交所類股代碼，例如 "24"' }),
  name: z.string().meta({ description: '中文類股名稱，例如「半導體業」' }),
  companyCount: z.number().meta({ description: '這個類股底下總共幾家公司（TWSE+TPEx 加總）' }),
});

export const securitiesIndustrySectorsResultSchema = z.object({
  sectors: z.array(securitiesIndustrySectorSchema),
}) satisfies z.ZodType<SecuritiesIndustrySectorsResult>;
export type { SecuritiesIndustrySectorsResult };
