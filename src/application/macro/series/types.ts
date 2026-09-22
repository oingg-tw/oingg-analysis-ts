import { z } from 'zod';

// 總經特區六支端點的回應 schema。月序列固定帶 period 'YYYY-MM' + year/month，季序列 period 'YYYY-Qn' + year/quarter，
// 全部由舊到新；數值欄位一律 nullable（來源統計表本來就有缺值，例如年增率的起始 12 個月）。
const monthPeriod = {
  period: z.string().meta({ description: '"YYYY-MM"，字典序即時間序' }),
  year: z.number().int(),
  month: z.number().int(),
};
const entriesMeta = { description: '由舊到新排序' };

export const businessCycleEntrySchema = z.object({
  ...monthPeriod,
  leadingIndexComposite: z.number().nullable().meta({ description: '領先指標綜合指數' }),
  leadingIndexDetrended: z.number().nullable().meta({ description: '領先指標不含趨勢指數' }),
  coincidentIndexComposite: z.number().nullable().meta({ description: '同時指標綜合指數' }),
  coincidentIndexDetrended: z.number().nullable().meta({ description: '同時指標不含趨勢指數' }),
  laggingIndexComposite: z.number().nullable().meta({ description: '落後指標綜合指數' }),
  laggingIndexDetrended: z.number().nullable().meta({ description: '落後指標不含趨勢指數' }),
  signalScore: z.number().nullable().meta({ description: '景氣對策信號綜合分數（9–45）' }),
  signalLight: z.string().nullable().meta({ description: '燈號中文：紅／黃紅／綠／黃藍／藍' }),
});
export const businessCycleResultSchema = z.object({ entries: z.array(businessCycleEntrySchema).meta(entriesMeta) });
export type BusinessCycleResult = z.infer<typeof businessCycleResultSchema>;

export const monetaryAggregateEntrySchema = z.object({
  ...monthPeriod,
  m1aAmount: z.number().nullable().meta({ description: 'M1A 日平均餘額，百萬新台幣' }),
  m1aYoyPercent: z.number().nullable().meta({ description: 'M1A 年增率 %' }),
  m1bAmount: z.number().nullable().meta({ description: 'M1B 日平均餘額，百萬新台幣' }),
  m1bYoyPercent: z.number().nullable().meta({ description: 'M1B 年增率 %' }),
  m2Amount: z.number().nullable().meta({ description: 'M2 日平均餘額，百萬新台幣' }),
  m2YoyPercent: z.number().nullable().meta({ description: 'M2 年增率 %' }),
});
export const monetaryAggregateResultSchema = z.object({ entries: z.array(monetaryAggregateEntrySchema).meta(entriesMeta) });
export type MonetaryAggregateResult = z.infer<typeof monetaryAggregateResultSchema>;

export const stockMarketSummaryEntrySchema = z.object({
  ...monthPeriod,
  listedCompanies: z.number().nullable().meta({ description: '上市公司家數' }),
  totalParValue: z.number().nullable().meta({ description: '上市股票面值總額，百萬新台幣' }),
  totalMarketValue: z.number().nullable().meta({ description: '上市股票市值總額，百萬新台幣' }),
  totalTradingValue: z.number().nullable().meta({ description: '當月成交值，百萬新台幣' }),
  avgDailyTradingValue: z.number().nullable().meta({ description: '日平均成交值，百萬新台幣（1987–88 為 null）' }),
  avgTaiex: z.number().nullable().meta({ description: '發行量加權股價指數當月平均（證交所編製、1966 年平均=100）——是月平均不是月底收盤，不要跟 /market/taiex-daily-price 的收盤序列接成同一條線' }),
  avgTaiexYoyPercent: z.number().nullable().meta({ description: '加權指數月平均年增率 %' }),
});
export const stockMarketSummaryResultSchema = z.object({ entries: z.array(stockMarketSummaryEntrySchema).meta(entriesMeta) });
export type StockMarketSummaryResult = z.infer<typeof stockMarketSummaryResultSchema>;

export const govBondYield10yHistoryEntrySchema = z.object({
  ...monthPeriod,
  yieldPct: z.number().nullable().meta({ description: '百分比，例如 1.9 代表 1.9%' }),
});
export const govBondYield10yHistoryResultSchema = z.object({ entries: z.array(govBondYield10yHistoryEntrySchema).meta(entriesMeta) });
export type GovBondYield10yHistoryResult = z.infer<typeof govBondYield10yHistoryResultSchema>;

export const usdTwdRateEntrySchema = z.object({
  tradeDate: z.string().meta({ description: '"YYYY-MM-DD"' }),
  bankBuyingRate: z.number().nullable().meta({ description: '銀行買入，元/美元' }),
  bankSellingRate: z.number().nullable().meta({ description: '銀行賣出，元/美元' }),
  interbankClosingRate: z.number().nullable().meta({ description: '銀行間收盤，元/美元' }),
});
export const usdTwdRateResultSchema = z.object({ entries: z.array(usdTwdRateEntrySchema).meta({ description: '依日期由舊到新排序，跟 /market/taiex-daily-price 同慣例' }) });
export type UsdTwdRateResult = z.infer<typeof usdTwdRateResultSchema>;

export const cpiEntrySchema = z.object({
  ...monthPeriod,
  indexValue: z.number().nullable().meta({ description: '指數（基期 = 100）' }),
  yoyChangePercent: z.number().nullable().meta({ description: '年增率 %' }),
});
export const cpiResultSchema = z.object({ category: z.string(), entries: z.array(cpiEntrySchema).meta(entriesMeta) });
export type CpiResult = z.infer<typeof cpiResultSchema>;

export const gdpEntrySchema = z.object({
  period: z.string().meta({ description: '"YYYY-Qn"，字典序即時間序' }),
  year: z.number().int(),
  quarter: z.number().int(),
  contributionPoints: z.number().nullable().meta({ description: 'category=growth_rate 時是經濟成長率 %；其餘 category 是該項目對經濟成長率的貢獻（百分點），各項加總 = growth_rate' }),
});
export const gdpResultSchema = z.object({ category: z.string(), entries: z.array(gdpEntrySchema).meta(entriesMeta) });
export type GdpResult = z.infer<typeof gdpResultSchema>;
