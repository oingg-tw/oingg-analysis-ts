import { z } from 'zod';

export const priceLimitRangeRowSchema = z.object({
  rank: z.number(),
  symbol: z.string(),
  companyName: z.string().nullable(),
  market: z.enum(['TWSE', 'TPEx']),
  limitUp: z.number().nullable(),
  limitDown: z.number().nullable(),
  limitRange: z.number().nullable(),
  openingRefPrice: z.number().nullable().meta({ description: 'TPEx 版本沒有這個欄位，null' }),
  previousDayPrice: z.number().nullable().meta({ description: 'TPEx 版本沒有這個欄位，null' }),
  allowOddLotTrade: z.string().nullable().meta({ description: 'TPEx 版本沒有這個欄位，null' }),
});
export type PriceLimitRangeRow = z.infer<typeof priceLimitRangeRowSchema>;

export const priceLimitRangeResultSchema = z.object({
  tradeDate: z.string(),
  widest: z.array(priceLimitRangeRowSchema).meta({ description: '漲跌停幅度最大前 20（rank_group=\'top\'）' }),
  narrowest: z.array(priceLimitRangeRowSchema).meta({ description: '漲跌停幅度最小前 20（rank_group=\'bottom\'）' }),
  warnings: z.array(z.string()),
});
export type PriceLimitRangeResult = z.infer<typeof priceLimitRangeResultSchema>;
