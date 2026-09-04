import { z } from 'zod';

export const priceChangeRankingQuerySchema = z.object({
  limit: z.number().meta({ description: '1~50，預設 20，漲幅/跌幅各取這麼多筆' }),
});
export type PriceChangeRankingQuery = z.infer<typeof priceChangeRankingQuerySchema>;

export const priceChangeRowSchema = z.object({
  rank: z.number(),
  symbol: z.string(),
  companyName: z.string().nullable(),
  market: z.enum(['TWSE', 'TPEx']),
  tradeDate: z.string().meta({ description: '這筆資料採用的交易日——上市/上櫃各自的最新交易日可能不同' }),
  previousTradeDate: z.string(),
  close: z.number(),
  previousClose: z.number(),
  changeAmount: z.number().meta({ description: 'close - previousClose' }),
  changePercent: z.number().meta({ description: '(close - previousClose) / previousClose x 100' }),
});
export type PriceChangeRow = z.infer<typeof priceChangeRowSchema>;

export const priceChangeRankingResultSchema = z.object({
  limit: z.number(),
  gainers: z.array(priceChangeRowSchema).meta({ description: '漲幅前 limit，由大到小' }),
  losers: z.array(priceChangeRowSchema).meta({ description: '跌幅前 limit，由小到大（跌最多排最前面）' }),
  warnings: z.array(z.string()),
});
export type PriceChangeRankingResult = z.infer<typeof priceChangeRankingResultSchema>;
