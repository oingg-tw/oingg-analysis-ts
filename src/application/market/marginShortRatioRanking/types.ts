import { MARKET_CODES } from '@/domain/market/marketCode';
import { z } from 'zod';

export const marginShortRatioRankingQuerySchema = z.object({
  limit: z.number().meta({ description: '預設 20，上限 100' }),
});
export type MarginShortRatioRankingQuery = z.infer<typeof marginShortRatioRankingQuerySchema>;

export const marginShortRatioRowSchema = z.object({
  rank: z.number(),
  symbol: z.string(),
  companyName: z.string().nullable(),
  market: z.enum(['TWSE', 'TPEx']),
  marketCode: z.enum(MARKET_CODES).meta({ description: 'MOPS TYPEK 市場別：sii 上市、otc 上櫃、rotc 興櫃（2026-10-10 詞彙表官方編碼；舊的 market 與 isEmerging 2026-10-24 移除，之後 marketCode 改名回 market）' }),
  shortToMarginRatioPct: z.number().meta({ description: '融券今日餘額 / 融資今日餘額 x 100' }),
  marginTodayBalance: z.string().meta({ description: 'BigInt 用字串傳遞' }),
  shortTodayBalance: z.string(),
});
export type MarginShortRatioRow = z.infer<typeof marginShortRatioRowSchema>;

export const marginShortRatioRankingResultSchema = z.object({
  tradeDate: z.string(),
  limit: z.number(),
  rankings: z.array(marginShortRatioRowSchema),
  warnings: z.array(z.string()),
});
export type MarginShortRatioRankingResult = z.infer<typeof marginShortRatioRankingResultSchema>;
