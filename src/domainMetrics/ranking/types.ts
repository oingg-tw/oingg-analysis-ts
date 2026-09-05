import { z } from 'zod';

export const rankingMetricSchema = z.enum(['peRatio', 'pbRatio', 'dividendYield']);
export type RankingMetric = z.infer<typeof rankingMetricSchema>;

export const rankingOrderSchema = z.enum(['asc', 'desc']);
export type RankingOrder = z.infer<typeof rankingOrderSchema>;

export const rankingQuerySchema = z.object({
  metric: rankingMetricSchema,
  order: rankingOrderSchema,
  limit: z.number(),
  date: z.string().optional().meta({ description: '選填，格式 YYYY-MM-DD；不給就抓 daily_valuation 目前最新一個交易日。' }),
});
export type RankingQuery = z.infer<typeof rankingQuerySchema>;

export const rankingRowSchema = z.object({
  rank: z.number(),
  symbol: z.string(),
  companyName: z.string().nullable(),
  value: z.number(),
});
export type RankingRow = z.infer<typeof rankingRowSchema>;

export const rankingResultSchema = z.object({
  metric: rankingMetricSchema,
  order: rankingOrderSchema,
  limit: z.number(),
  tradeDate: z.string().nullable().meta({ description: '實際使用的交易日；查無任何資料時為 null。' }),
  excludedNonPositiveCount: z.number().meta({
    description: 'peRatio/pbRatio 排除了 <= 0 的公司（虧損或淨值為負，不是「便宜」，是財務體質問題，混進排行會誤導），這裡記錄排除了幾家；dividendYield 沒有這個排除。',
  }),
  rankings: z.array(rankingRowSchema),
  warnings: z.array(z.string()),
});
export type RankingResult = z.infer<typeof rankingResultSchema>;
