import { z } from 'zod';
import { attentionCriteriaDetailSchema, type AttentionCriteriaDetail } from './parseCriteria';

export type { AttentionCriteriaDetail };

export const attentionStocksQuerySchema = z.object({
  limit: z.number().meta({ description: '1~50，預設 20' }),
});
export type AttentionStocksQuery = z.infer<typeof attentionStocksQuerySchema>;

export const attentionStockRowSchema = z.object({
  symbol: z.string(),
  companyName: z.string().nullable(),
  market: z.enum(['TWSE', 'TPEx']),
  tradeDate: z.string(),
  criteria: z.string().nullable().meta({ description: '原始中文說明，可能包含多個原因子句直接串接' }),
  criteriaDetails: z.array(attentionCriteriaDetailSchema).meta({ description: '從 criteria 解析出的結構化資料，解析失敗時是空陣列' }),
  sixDayChangePercent: z.number().nullable().meta({ description: '以 tradeDate 為基準日的近 6 個交易日累積漲跌幅（點對點），資料不足時是 null' }),
});
export type AttentionStockRow = z.infer<typeof attentionStockRowSchema>;

export const attentionStocksResultSchema = z.object({
  limit: z.number(),
  items: z.array(attentionStockRowSchema),
  warnings: z.array(z.string()),
});
export type AttentionStocksResult = z.infer<typeof attentionStocksResultSchema>;
