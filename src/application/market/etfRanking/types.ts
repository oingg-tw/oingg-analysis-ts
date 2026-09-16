import { z } from 'zod';

export const etfRankingMetricSchema = z.enum([
  'aum',
  'holders',
  'netFlow',
  'dcaAmount',
  'return3m',
  'return6m',
  'return1y',
  'return2y',
  'return3y',
  'return5y',
  'returnYtd',
  'return10y',
  'expenseRatio',
]);
export type EtfRankingMetric = z.infer<typeof etfRankingMetricSchema>;

export const etfRankingQuerySchema = z.object({
  metric: etfRankingMetricSchema,
  order: z.enum(['asc', 'desc']),
  limit: z.number().meta({ description: '1~50，預設 20' }),
});
export type EtfRankingQuery = z.infer<typeof etfRankingQuerySchema>;

export const etfRankingRowSchema = z.object({
  rank: z.number(),
  symbol: z.string().meta({ description: 'security_code' }),
  fundName: z.string().nullable(),
  shortName: z.string().nullable(),
  companyName: z.string().nullable().meta({ description: '發行的投信公司，不是股票上市公司，不用查 company_profile' }),
  category: z.string().nullable().meta({ description: '原始分類字串，例如「上市ETF_國外成分證券ETF」' }),
  market: z.enum(['TWSE', 'TPEx']).nullable().meta({ description: '從 category 拆出，解析不出來時是 null' }),
  assetClass: z.string().nullable().meta({ description: '從 category 拆出的成分類型，主動式 ETF 沒有這個概念時是 null' }),
  isActive: z.boolean().nullable().meta({ description: '是否為主動式 ETF——直接讀 sitca-ts 的 is_actively_managed 權威欄位，不是猜的' }),
  belowStatutoryThreshold: z.boolean().nullable().meta({ description: '規模是否低於法定下市門檻（下市風險近似警示）' }),
  distributionFrequency: z.string().nullable().meta({ description: '從 distribution_class_info 拆出的配息頻率（月配/季配/半年配/年配/一年兩次配息/其他/不分配），解析不出來時是 null' }),
  value: z.number(),
  asOf: z.string().meta({ description: '大部分 metric 是 "YYYY-MM"（月快照）；expenseRatio 是 "YYYY"（完整年度）' }),
});
export type EtfRankingRow = z.infer<typeof etfRankingRowSchema>;

export const etfRankingResultSchema = z.object({
  metric: etfRankingMetricSchema,
  order: z.enum(['asc', 'desc']),
  limit: z.number(),
  rankings: z.array(etfRankingRowSchema),
  warnings: z.array(z.string()),
});
export type EtfRankingResult = z.infer<typeof etfRankingResultSchema>;
