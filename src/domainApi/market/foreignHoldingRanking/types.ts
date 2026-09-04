import { z } from 'zod';

export const foreignHoldingRankingQuerySchema = z.object({
  limit: z.number().meta({ description: '1~20，預設 10——取變動幅度排序後的前幾筆，固定筆數不是百分比' }),
});
export type ForeignHoldingRankingQuery = z.infer<typeof foreignHoldingRankingQuerySchema>;

export const foreignHoldingChangeRowSchema = z.object({
  symbol: z.string(),
  companyName: z.string().nullable(),
  sharesHeldPercent: z.number().meta({ description: '今天的外資持股比例（%）' }),
  previousSharesHeldPercent: z.number().meta({ description: '上一個交易日的外資持股比例（%）' }),
  changePercentagePoints: z.number().meta({ description: '今天 - 上一個交易日，正值代表加碼、負值代表減碼' }),
  sharesHeld: z.string().meta({ description: '今天的外資持股張數（BigInt 用字串傳遞）' }),
});
export type ForeignHoldingChangeRow = z.infer<typeof foreignHoldingChangeRowSchema>;

export const foreignHoldingRankingResultSchema = z.object({
  tradeDate: z.string().meta({ description: '最新一個有資料的交易日' }),
  previousTradeDate: z.string().meta({ description: '用來比對的前一個交易日' }),
  limit: z.number(),
  eligibleCompanyCount: z.number().meta({ description: '兩個交易日都有資料、可以比較的公司數' }),
  increases: z.array(foreignHoldingChangeRowSchema).meta({ description: '加碼幅度前 limit 筆，由大到小' }),
  decreases: z.array(foreignHoldingChangeRowSchema).meta({ description: '減碼幅度前 limit 筆，由小到大（減碼最多的排最前面）' }),
  warnings: z.array(z.string()),
});
export type ForeignHoldingRankingResult = z.infer<typeof foreignHoldingRankingResultSchema>;
