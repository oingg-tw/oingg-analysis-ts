import { z } from 'zod';
import { metricStatusSchema } from '@/shared/metricStatus';

export const equityRiskPremiumQuerySchema = z.object({
  // 全部選填，格式 YYYY-MM；不給任一組就用「TAIEX 月底收盤與無風險利率都有資料」的完整重疊區間
  // 起訖（見文件建議：歷史法 ERP 應該用越長的樣本越好，不要預設短窗口）。
  startYear: z.number().optional(),
  startMonth: z.number().optional(),
  endYear: z.number().optional(),
  endMonth: z.number().optional(),
});
export type EquityRiskPremiumQuery = z.infer<typeof equityRiskPremiumQuerySchema>;

export const equityRiskPremiumResultSchema = z.object({
  windowStart: z.string().nullable().meta({ description: '實際使用的窗口起訖（YYYY-MM）；完全查無重疊資料則為 null' }),
  windowEnd: z.string().nullable(),
  months: z.number().meta({ description: '窗口內「TAIEX 與無風險利率都有資料」的月數，報酬率樣本數 = months - 1' }),
  marketReturnGeometric: z.number().nullable().meta({ description: 'TAIEX 年化幾何報酬率，百分比數字（例如 5.80 代表 5.80%）' }),
  marketReturnArithmetic: z.number().nullable().meta({ description: 'TAIEX 年化算術報酬率（月報酬率平均 x 12）' }),
  avgRiskFreeRate: z.number().nullable().meta({ description: '同期 10 年期公債次級市場殖利率平均' }),
  erpGeometric: z.number().nullable().meta({ description: 'marketReturnGeometric - avgRiskFreeRate' }),
  erpArithmetic: z.number().nullable().meta({ description: 'marketReturnArithmetic - avgRiskFreeRate' }),
  requestedWindow: z.object({
    startYear: z.number().optional(),
    startMonth: z.number().optional(),
    endYear: z.number().optional(),
    endMonth: z.number().optional(),
  }),
  clippedToAvailableData: z.boolean().meta({ description: '有指定 start/end，但窗口被裁切到資料實際涵蓋範圍時為 true' }),
  dataCoverage: z.object({
    taiexDateRange: z.object({ min: z.string().nullable(), max: z.string().nullable() }).meta({ description: 'oingg-twse daily_taiex_index 整體月底收盤涵蓋範圍（跟 query 無關）' }),
    riskFreeRateDateRange: z.object({ min: z.string().nullable(), max: z.string().nullable() }).meta({ description: 'GOV monthly_gov_bond_yield_10y 整體涵蓋範圍' }),
  }),
  fieldStatuses: z.record(z.string(), metricStatusSchema).meta({
    description: '只列出值為 null 的欄位（marketReturnGeometric/marketReturnArithmetic/avgRiskFreeRate/erpGeometric/erpArithmetic）',
  }),
  warnings: z.array(z.string()),
});
export type EquityRiskPremiumResult = z.infer<typeof equityRiskPremiumResultSchema>;
