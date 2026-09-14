import { z } from 'zod';

export const taiexDailyPriceEntrySchema = z.object({
  tradeDate: z.string().meta({ description: '"YYYY-MM-DD"' }),
  close: z.number().nullable(),
});
export type TaiexDailyPriceEntry = z.infer<typeof taiexDailyPriceEntrySchema>;

export const taiexDailyPriceResultSchema = z.object({
  entries: z.array(taiexDailyPriceEntrySchema).meta({ description: '依交易日由舊到新排序（畫線圖方便直接照順序畫，不用前端自己反轉），跟 daily-price-history 同一種慣例' }),
});
export type TaiexDailyPriceResult = z.infer<typeof taiexDailyPriceResultSchema>;
