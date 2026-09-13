import { z } from 'zod';
import { exDividendNoticeEntrySchema, exDividendCalendarEntrySchema } from '@/shared/sourceData/exDividendNotice';
import { foreignShareholdingEntrySchema } from '@/shared/sourceData/foreignShareholding';
import { stockPledgeRatioEntrySchema } from '@/shared/sourceData/stockPledgeRatio';

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

// 2026-09-13 web-nuxt 回報：個股頁一直靠前端寫死的 20 檔權值股清單（MOCK_STOCK_UNIVERSE）
// 判斷「這檔股票存不存在」，2801 這類不在清單裡的股票會顯示「找不到這檔股票」——根本原因
// 是誤以為要先撈一份全市場清單存起來，這個後端的設計其實是「按 symbol 現查」，不需要
// 全市場清單。這支端點把個股頁需要的 6 項（股價/漲跌/成交量/PER/PBR/殖利率/市值）組合
// 成一次回傳，取代原本要串 3 支端點（quote + daily-price-history + metric-history）的做法。
// 三個區塊(price/valuation/marketCap)各自獨立查詢、各自有自己的 tradeDate——理論上同一
// 交易日會同步，但不保證（跟既有 stockQuoteResultSchema 的 price/valuation 分開同一個
// 理由），不要假設三者一定同一天。
export const stockSummaryChangeSchema = z.object({
  amount: z.number().nullable().meta({ description: '收盤價比前一個交易日的變動金額' }),
  percent: z.number().nullable().meta({ description: '變動百分比；前一交易日收盤價為 0 時是 null（避免除以零）' }),
});
export type StockSummaryChange = z.infer<typeof stockSummaryChangeSchema>;

export const stockSummaryPriceSchema = z.object({
  tradeDate: z.string(),
  close: z.number().nullable(),
  volume: z.number().nullable(),
  change: stockSummaryChangeSchema.nullable().meta({ description: '查無前一個交易日資料時整體是 null（例如剛掛牌只有一天資料）' }),
});
export type StockSummaryPrice = z.infer<typeof stockSummaryPriceSchema>;

export const stockSummaryMarketCapSchema = z.object({
  tradeDate: z.string(),
  value: z.number().nullable(),
});
export type StockSummaryMarketCap = z.infer<typeof stockSummaryMarketCapSchema>;

export const stockSummaryResultSchema = z.object({
  symbol: z.string(),
  price: stockSummaryPriceSchema.nullable(),
  valuation: stockQuoteValuationSchema.nullable(),
  marketCap: stockSummaryMarketCapSchema.nullable(),
});
export type StockSummaryResult = z.infer<typeof stockSummaryResultSchema>;

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

export const stockPledgeRatioHistoryResultSchema = z.object({
  symbol: z.string(),
  entries: z.array(stockPledgeRatioEntrySchema).meta({ description: '依日期新到舊排序' }),
});
export type StockPledgeRatioHistoryResult = z.infer<typeof stockPledgeRatioHistoryResultSchema>;

export const dailyPriceHistoryEntrySchema = z.object({
  tradeDate: z.string().meta({ description: '"YYYY-MM-DD"' }),
  open: z.number().nullable(),
  high: z.number().nullable(),
  low: z.number().nullable(),
  close: z.number().nullable(),
  volume: z.number().nullable(),
});
export type DailyPriceHistoryEntry = z.infer<typeof dailyPriceHistoryEntrySchema>;

export const dailyPriceHistoryResultSchema = z.object({
  symbol: z.string(),
  entries: z.array(dailyPriceHistoryEntrySchema).meta({ description: '依交易日由舊到新排序（畫線圖方便直接照順序畫，不用前端自己反轉）' }),
});
export type DailyPriceHistoryResult = z.infer<typeof dailyPriceHistoryResultSchema>;
