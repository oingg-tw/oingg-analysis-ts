import { z } from 'zod';

// 2026-09-06 新增——特別股清單，見 controller.ts 的 getPreferredStocks 說明。
export const preferredStockEntrySchema = z.object({
  symbol: z.string().meta({ description: '特別股本身的證券代號，例如 "1101B"，跟發行公司的普通股代號（"1101"）不同' }),
  name: z.string(),
  isinCode: z.string(),
  listedDate: z.string(),
  marketType: z.string(),
  issueDate: z.string().nullable(),
  issuePrice: z.number().nullable().meta({ description: '發行價（新台幣元）' }),
  dividendRate: z.number().nullable().meta({ description: '每股固定配息金額（新台幣元），不是百分比——欄位名稱容易誤會' }),
  nominalDividendRatePct: z.number().nullable().meta({ description: '票面利率 = dividendRate/issuePrice*100，發行時基準，之後不隨股價變動' }),
  currentYieldPct: z.number().nullable().meta({ description: '目前殖利率 = dividendRate/最新收盤價*100，隨股價每天變動；查無股價資料時為 null' }),
  latestClosePrice: z.number().nullable(),
  latestPriceDate: z.string().nullable(),
  cumulativeDividend: z.boolean().nullable().meta({ description: '是否為累積特別股（該年度未發放的股息可以累積到以後年度）' }),
  participatingExcessDividend: z.boolean().nullable().meta({ description: '是否參與分配超額股利' }),
  liquidationPreference: z.boolean().nullable().meta({ description: '剩餘財產分配是否優先於普通股' }),
  votingRights: z.boolean().nullable(),
  convertible: z.boolean().nullable().meta({ description: '是否可轉換為普通股' }),
  conversionStartDate: z.string().nullable(),
  redeemable: z.boolean().nullable().meta({ description: '發行公司是否可強制買回' }),
  redemptionDate: z.string().nullable(),
  redemptionConditions: z.string().nullable(),
});
export type PreferredStockEntry = z.infer<typeof preferredStockEntrySchema>;

export const preferredStocksResultSchema = z.object({
  entries: z.array(preferredStockEntrySchema),
});
export type PreferredStocksResult = z.infer<typeof preferredStocksResultSchema>;
