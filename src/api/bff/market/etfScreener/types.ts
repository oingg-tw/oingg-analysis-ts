import { z } from 'zod';

export const etfNumericFilterInputSchema = z.object({
  field: z.string(),
  min: z.number().nullable(),
  max: z.number().nullable(),
  exclude: z.boolean().optional(),
});
export type EtfNumericFilterInput = z.infer<typeof etfNumericFilterInputSchema>;

export const etfCategoricalFilterInputSchema = z.object({
  field: z.string(),
  values: z.array(z.string()),
});
export type EtfCategoricalFilterInput = z.infer<typeof etfCategoricalFilterInputSchema>;

export const etfFilterInputSchema = z.union([etfNumericFilterInputSchema, etfCategoricalFilterInputSchema]);
export type EtfFilterInput = z.infer<typeof etfFilterInputSchema>;

export const etfColumnInputSchema = z.object({
  field: z.string(),
});
export type EtfColumnInput = z.infer<typeof etfColumnInputSchema>;

export const etfScreenerRequestSchema = z.object({
  filters: z.array(etfFilterInputSchema),
  columns: z.array(etfColumnInputSchema),
  page: z.number().optional(),
  pageSize: z.number().optional(),
  sortField: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});
export type EtfScreenerRequest = z.infer<typeof etfScreenerRequestSchema>;

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
  kind: z.enum(['numeric', 'categorical']),
  values: z.array(z.string()).optional().meta({ description: '只有 categorical 欄位才有' }),
});
export type EtfFilterFieldCatalogEntry = z.infer<typeof etfFilterFieldCatalogEntrySchema>;

export const etfFilterCatalogResponseSchema = z.object({
  fields: z.array(etfFilterFieldCatalogEntrySchema),
});
export type EtfFilterCatalogResponse = z.infer<typeof etfFilterCatalogResponseSchema>;
