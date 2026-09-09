import { z } from 'zod';
import { exDividendNoticeEntrySchema, exDividendCalendarEntrySchema } from '@/shared/sourceData/exDividendNotice';
import { foreignShareholdingEntrySchema } from '@/shared/sourceData/foreignShareholding';

export const stockQuotePriceSchema = z.object({
  tradeDate: z.string(),
  close: z.number().nullable(),
});
export type StockQuotePrice = z.infer<typeof stockQuotePriceSchema>;

export const stockQuoteValuationSchema = z.object({
  tradeDate: z.string(),
  peRatio: z.number().nullable(),
  pbRatio: z.number().nullable(),
  dividendYield: z.number().nullable(),
});
export type StockQuoteValuation = z.infer<typeof stockQuoteValuationSchema>;

export const stockQuoteResultSchema = z.object({
  symbol: z.string(),
  price: stockQuotePriceSchema.nullable(),
  valuation: stockQuoteValuationSchema.nullable(),
});
export type StockQuoteResult = z.infer<typeof stockQuoteResultSchema>;

export const stockPricesResultSchema = z.object({
  prices: z.record(z.string(), z.object({ close: z.number().nullable(), tradeDate: z.string() })).meta({
    description: 'key 是 symbol，查不到的 symbol 直接不出現（不是回傳 null 值）',
  }),
});
export type StockPricesResult = z.infer<typeof stockPricesResultSchema>;

export const exDividendNoticesResultSchema = z.object({
  notices: z.record(z.string(), z.array(exDividendNoticeEntrySchema)).meta({
    description: 'key 是 symbol，查不到的 symbol 直接不出現',
  }),
});
export type ExDividendNoticesResult = z.infer<typeof exDividendNoticesResultSchema>;

export const exDividendCalendarResultSchema = z.object({
  entries: exDividendCalendarEntrySchema.extend({ companyName: z.string().nullable() }).array().meta({
    description: '依除權息基準日由舊到新排序（同一天有多筆時再依 symbol 排序），每一筆都帶 symbol/companyName',
  }),
});
export type ExDividendCalendarResult = z.infer<typeof exDividendCalendarResultSchema>;

export const foreignShareholdingHistoryResultSchema = z.object({
  symbol: z.string(),
  entries: z.array(foreignShareholdingEntrySchema).meta({ description: '依日期新到舊排序' }),
});
export type ForeignShareholdingHistoryResult = z.infer<typeof foreignShareholdingHistoryResultSchema>;
