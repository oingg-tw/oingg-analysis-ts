import { z } from 'zod';
import { metricStatusSchema } from '@/domain/metrics/metricStatus';

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
  supplySide: z
    .object({
      erp: z.number().nullable().meta({ description: '(1 + expectedInflation)(1 + realEarningsGrowth) − 1 + dividendYield − riskFreeRate，百分比數字；任一輸入缺就是 null' }),
      expectedInflation: z.number().nullable().meta({ description: '窗口內 CPI 總指數年增率的幾何平均（%）。台灣沒有抗通膨公債，無法從市場價格反推預期通膨，所以用同期實際通膨代替' }),
      realEarningsGrowth: z.number().nullable().meta({
        description: '窗口內實質 GDP 成長率（季，年增率）的幾何平均（%），當作實質盈餘成長的近似。盈餘成長長期會因新股稀釋而低於 GDP 成長，這一項可能高估',
      }),
      peGrowth: z.literal(0).meta({ description: '本益比成長，供給面模型固定為 0（本益比擴張不是公司供給的報酬，不預期持續）' }),
      dividendYield: z.number().nullable().meta({ description: '上市公司現金殖利率的市值加權平均（%），固定取最新交易日（沒有長期歷史可平均）' }),
      riskFreeRate: z.number().nullable().meta({ description: '窗口最後一個月的 10 年期公債殖利率（%）' }),
      inflationMonths: z.number().meta({ description: '通膨平均用到的月數' }),
      gdpQuarters: z.number().meta({ description: 'GDP 成長平均用到的季數' }),
      dividendYieldTradeDate: z.string().nullable().meta({ description: '殖利率的交易日（YYYY-MM-DD）' }),
      dividendYieldCompanyCount: z.number().meta({ description: '納入市值加權的上市公司家數（殖利率 0＝不配息的公司也算在內，沒有殖利率資料的排除）' }),
      dividendYieldMarketCapCoverage: z.number().nullable().meta({ description: '納入計算的公司市值占全部上市公司市值的比例（%）' }),
    })
    .nullable()
    .meta({
      description:
        '第二種算法（供給面模型），給歷史法做對照：照 Ibbotson & Chen (2003) 的做法，股票報酬拆成通膨＋實質盈餘成長＋股利，本益比成長設 0，再減無風險利率。' +
        '通膨跟成長用跟歷史法同一段窗口平均；殖利率跟無風險利率取窗口終點的值。TAIEX 與無風險利率完全沒有重疊月份時是 null',
    }),
  fieldStatuses: z.record(z.string(), metricStatusSchema).meta({
    description: '只列出值為 null 的欄位（marketReturnGeometric/marketReturnArithmetic/avgRiskFreeRate/erpGeometric/erpArithmetic）',
  }),
  warnings: z.array(z.string()),
});
export type EquityRiskPremiumResult = z.infer<typeof equityRiskPremiumResultSchema>;
