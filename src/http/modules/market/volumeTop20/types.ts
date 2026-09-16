import { z } from 'zod';

export const volumeTop20RowSchema = z.object({
  rank: z.number(),
  symbol: z.string(),
  companyName: z.string().nullable(),
  market: z.enum(['TWSE', 'TPEx']),
  volume: z.string().meta({ description: 'BigInt 用字串傳遞' }),
  transaction: z.string().nullable().meta({ description: 'TPEx 版本沒有這個欄位，null' }),
  open: z.number().nullable().meta({ description: 'TPEx 版本沒有這個欄位，null' }),
  high: z.number().nullable().meta({ description: 'TPEx 版本沒有這個欄位，null' }),
  low: z.number().nullable().meta({ description: 'TPEx 版本沒有這個欄位，null' }),
  close: z.number().nullable().meta({ description: 'TPEx 版本沒有這個欄位，null' }),
  dir: z.string().nullable().meta({ description: "'+' 漲 / '-' 跌 / '' 平盤，TPEx 版本沒有這個欄位，null" }),
  change: z.number().nullable().meta({ description: 'TPEx 版本沒有這個欄位，null' }),
  changePercent: z.number().nullable().meta({ description: '單日漲跌幅（自己用 daily_price 算的點對點百分比，不是來源的 dir/change），資料不足時是 null' }),
});
export type VolumeTop20Row = z.infer<typeof volumeTop20RowSchema>;

export const volumeTop20ResultSchema = z.object({
  tradeDate: z.string(),
  rankings: z.array(volumeTop20RowSchema),
  warnings: z.array(z.string()),
});
export type VolumeTop20Result = z.infer<typeof volumeTop20ResultSchema>;
