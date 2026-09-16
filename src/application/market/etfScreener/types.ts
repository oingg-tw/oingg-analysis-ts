import { z } from 'zod';

export const etfNumericFilterInputSchema = z.object({
  field: z.string(),
  min: z.number().nullable(),
  max: z.number().nullable(),
  exclude: z.boolean().optional(),
});

export const etfCategoricalFilterInputSchema = z.object({
  field: z.string(),
  values: z.array(z.string()),
});

// 日期欄位（目前只有 establishedDate）——跟數字欄位同一種 min/max/exclude 形狀，只是
// min/max 是 'YYYY-MM-DD' 字串不是數字，zod union 靠這個型別差異區分跟 numeric 的請求。
export const etfDateFilterInputSchema = z.object({
  field: z.string(),
  min: z.string().nullable(),
  max: z.string().nullable(),
  exclude: z.boolean().optional(),
});

export const etfFilterInputSchema = z.union([etfNumericFilterInputSchema, etfDateFilterInputSchema, etfCategoricalFilterInputSchema]);
export type EtfFilterInput = z.infer<typeof etfFilterInputSchema>;

export const etfColumnInputSchema = z.object({
  field: z.string(),
});
export type EtfColumnInput = z.infer<typeof etfColumnInputSchema>;

// 請求 schema（filters/columns/page/pageSize/sortField/sortOrder）在 http/modules/market/etfScreener/schemas.ts，
// use case 收的是 service.ts 的 EtfScreenerRequest 介面。

export const etfScreenerRowSchema = z.object({
  symbol: z.string(),
  fundName: z.string().nullable(),
  shortName: z.string().nullable(),
  companyName: z.string().nullable().meta({ description: '發行的投信公司' }),
  category: z.string().nullable().meta({ description: '原始分類字串' }),
  values: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()]).nullable()),
});
export type EtfScreenerRow = z.infer<typeof etfScreenerRowSchema>;

export const etfScreenerResponseSchema = z.object({
  count: z.number(),
  page: z.number(),
  pageSize: z.number(),
  totalPages: z.number(),
  results: z.array(etfScreenerRowSchema),
});
export type EtfScreenerResponse = z.infer<typeof etfScreenerResponseSchema>;

export const etfFilterFieldCatalogEntrySchema = z.object({
  field: z.string(),
  label: z.string(),
  unit: z.string().optional().meta({ description: '只有 numeric 欄位才有，例如 "元"/"%"/"人"' }),
  kind: z.enum(['numeric', 'categorical', 'date']),
  values: z.array(z.string()).optional().meta({ description: '只有 categorical 欄位才有' }),
});
export type EtfFilterFieldCatalogEntry = z.infer<typeof etfFilterFieldCatalogEntrySchema>;

// 2026-09-11 使用者要求比照股票 GET /filters 的巢狀分類建立指標選單——原本是扁平
// fields 陣列，改成跟股票端同一種 { categoryKey, categoryDisplayName, fields[] } 形狀，
// 是 breaking change，已通知 web-nuxt。
export const etfFilterCategorySchema = z.object({
  categoryKey: z.enum(['identity', 'sizeAndFlow', 'navAndPrice', 'performance', 'cost']),
  categoryDisplayName: z.string(),
  fields: z.array(etfFilterFieldCatalogEntrySchema),
});

export const etfFilterCatalogResponseSchema = z.object({
  categories: z.array(etfFilterCategorySchema),
});
export type EtfFilterCatalogResponse = z.infer<typeof etfFilterCatalogResponseSchema>;
