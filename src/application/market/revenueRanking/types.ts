import { z } from 'zod';

// 2026-09-13 使用者要求拔掉 mom/revenue 排行——月增率波動太大容易受季節性因素干擾、
// 單純營收金額排行沒有「成長」意涵，兩者都被判定為沒有實際選股價值，只留 yoy（年增率，
// 有基期趨近於零的統計失真排除規則，是三者裡唯一有實際使用價值的）。原本 metric 是
// 三選一的列舉，現在只剩一個合法值，維持 z.enum 而不是拿掉這個欄位，是為了不破壞既有
// 呼叫端已經在傳的 metric=yoy 這個參數形狀。
export const revenueRankingMetricSchema = z.enum(['yoy']);

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
