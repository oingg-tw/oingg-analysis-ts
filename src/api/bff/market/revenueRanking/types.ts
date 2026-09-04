import { z } from 'zod';

export const revenueRankingMetricSchema = z.enum(['yoy', 'mom', 'revenue']);
export type RevenueRankingMetric = z.infer<typeof revenueRankingMetricSchema>;

export const revenueRankingQuerySchema = z.object({
  metric: revenueRankingMetricSchema,
  order: z.enum(['asc', 'desc']),
  limit: z.number().meta({ description: '1~50，預設 20' }),
});
export type RevenueRankingQuery = z.infer<typeof revenueRankingQuerySchema>;

export const revenueRankingRowSchema = z.object({
  rank: z.number(),
  symbol: z.string(),
  companyName: z.string().nullable(),
  market: z.enum(['TWSE', 'TPEx']),
  currentMonthRevenue: z.string().nullable().meta({ description: 'BigInt 用字串傳遞' }),
  momChangePercent: z.number().nullable(),
  yoyChangePercent: z.number().nullable(),
});
export type RevenueRankingRow = z.infer<typeof revenueRankingRowSchema>;

export const revenueRankingResultSchema = z.object({
  yearMonth: z.string().meta({ description: '最新一個有資料的月份，YYYY-MM' }),
  metric: revenueRankingMetricSchema,
  order: z.enum(['asc', 'desc']),
  limit: z.number(),
  rankings: z.array(revenueRankingRowSchema),
  warnings: z.array(z.string()),
});
export type RevenueRankingResult = z.infer<typeof revenueRankingResultSchema>;
