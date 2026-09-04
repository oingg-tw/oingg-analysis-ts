import { z } from 'zod';

// bff-ts 的直連 DB 反模式修復計畫最後一塊：他們原本直接對本服務的 DB 跑動態 CTE/JOIN，
// 換成呼叫這兩支 API。介面形狀照他們現有對外契約設計（前端不用改）。

export const screenerFilterInputSchema = z.object({
  field: z.string().meta({ description: '"<metricKey>.<fieldKey>"，要能透過 metricTableRegistry.resolveField 解析' }),
  min: z.number().nullable(),
  max: z.number().nullable(),
  exclude: z
    .boolean()
    .optional()
    .meta({ description: '預設 false：保留落在 [min, max] 內的值；true：保留落在 [min, max] 外的值。值本身是 null 一律排除，不管 exclude 是哪個方向。' }),
});
export type ScreenerFilterInput = z.infer<typeof screenerFilterInputSchema>;

export const screenerColumnInputSchema = z.object({
  field: z.string(),
});
export type ScreenerColumnInput = z.infer<typeof screenerColumnInputSchema>;

export const screenerRequestSchema = z.object({
  filters: z.array(screenerFilterInputSchema),
  columns: z.array(screenerColumnInputSchema),
  page: z.number().optional(),
  pageSize: z.number().optional(),
  sortField: z.string().optional().meta({
    description:
      '"symbol" 或已經列在 columns 裡的 "metricKey.fieldKey"——沒給就照舊用 symbol 由小到大排序（保證分頁穩定，不是「沒有排序」）。不支援排「公司名稱」。',
  }),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});
export type ScreenerRequest = z.infer<typeof screenerRequestSchema>;

export const screenerValueSchema = z.object({
  value: z.number().nullable(),
  asOfDate: z.string().nullable(),
});
export type ScreenerValue = z.infer<typeof screenerValueSchema>;

export const screenerRowSchema = z.object({
  symbol: z.string(),
  companyName: z.string().nullable(),
  values: z.record(z.string(), screenerValueSchema),
});
export type ScreenerRow = z.infer<typeof screenerRowSchema>;

export const screenerResponseSchema = z.object({
  count: z.number(),
  page: z.number(),
  pageSize: z.number(),
  totalPages: z.number(),
  results: z.array(screenerRowSchema),
});
export type ScreenerResponse = z.infer<typeof screenerResponseSchema>;

export const screenerRankingRequestSchema = z.object({
  field: z.string(),
  direction: z.enum(['asc', 'desc']),
  limit: z.number(),
  columns: z.array(z.string()),
});
export type ScreenerRankingRequest = z.infer<typeof screenerRankingRequestSchema>;

export const screenerRankingResponseSchema = z.object({
  results: z.array(screenerRowSchema),
});
export type ScreenerRankingResponse = z.infer<typeof screenerRankingResponseSchema>;
