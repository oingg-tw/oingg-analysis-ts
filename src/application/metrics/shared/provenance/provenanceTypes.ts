import { z } from 'zod';

// 2026-09-10：指標溯源（provenance）的共用型別。刻意「不」涵蓋全部 117 支 metricCode——
// PILOT_PROVENANCE_METRIC_CODES 是明確維護的試點清單，之後要擴大範圍必須逐一加進這個
// 清單 + 寫對應的 get<Metric>Provenance 函式，不會有「看起來支援但其實沒人測過」的
// 隱性涵蓋，這是吸取 dependsOn（沒有執行期消費者、範圍廣但沒人維護）的教訓，見
// GET /companies/piotroski-breakdown 同一天稍早的先例。
//
// 逐批擴大的歷史沿革（哪支指標何時、為何加入）不記在這裡——那些細節在各自
// get<Metric>Provenance.ts 檔案開頭的註解裡（例如 fieldKey 選擇、TTM vs Q 邏輯、
// 跟原始 compute 檔案的關係），這裡重複記錄只會讓這個檔案跟著長胖，是吸取
// companies/controller.ts 764 行巨石檔案（2026-09-13 拆分過）的教訓。已完成的分類：
// 「營運效率」(16/16)、「財務韌性」扣掉 5 支銀行專屬指標後全部完成(19/19)、
// 「獲利能力」全部完成(20/20)、「成長性」全部完成(15/15，epsCagr/revenueCagr 各自
// 拆 3/5/8 年三個 metricCode)、「股東政策」扣掉 dividendYield 後全部完成(7/8，
// dividendYield 是交易所每日公告 passthrough，用 tradeDate 不是 year/season 定位、
// 寫進獨立的 metric_daily_cadence_values，跟這支端點 QuarterlyMetricQuery 的查詢形狀
// 結構性不合，不是遺漏——同樣結構性不合的還有 exchangePeRatio/exchangePbRatio)、
// 「市場評價」扣掉 beta/liveGrahamNumber/liveMarketCap/livePegRatio 後全部完成
// (20/24，這 4 支用自訂 tradeDate query 不是 QuarterlyMetricQuery，跟 dividendYield
// 同一種結構性不合)、「獲利品質」扣掉 piotroskiFScore 後全部完成(12/13，
// piotroskiFScore 已有專屬的 GET /companies/piotroski-breakdown 端點做同樣的「秀出
// 計算依據」用途，不重複做)。7 大分類至此全部完成，剩下的都是結構性不合或已有專屬
// 端點的例外。目前有稽核鏈的 metricCode 清單就是下面這個陣列本身，count 是
// `.length`，不用另外手動維護數字說明。
export const PILOT_PROVENANCE_METRIC_CODES = [
  'sue',
  'chowderNumber',
  'roe',
  'accrualsRatio',
  'dividendPayoutRatio',
  'altmanZScore',
  'dupontTaxBurden',
  'dupontInterestBurden',
  'inventoryTurnover',
  'receivablesTurnover',
  'fixedAssetTurnover',
  'payablesTurnover',
  'inventoryDays',
  'receivablesDays',
  'payablesDays',
  'cashConversionCycle',
  'operatingCycle',
  'netWorkingCapitalTurnover',
  'inventoryToRevenueRatio',
  'receivablesToRevenueRatio',
  'capexToRevenue',
  'capexToOcfRatio',
  'operatingExpenseRatio',
  'currentRatio',
  'quickRatio',
  'cashRatio',
  'debtRatio',
  'deRatio',
  'longTermDebtToNetCurrentAssets',
  'equityRatio',
  'cashToAssetsRatio',
  'financialLeverageDegree',
  'totalLeverageDegree',
  'interestCoverage',
  'netDebtToEbitda',
  'netWorkingCapitalToAssets',
  'totalDebtToCapital',
  'debtToFcf',
  'altmanZDoublePrimeScore',
  'zmijewskiScore',
  'ohlsonOScore',
  'eps',
  'pretaxIncomePerShare',
  'revenuePerShare',
  'roa',
  'netProfitMargin',
  'dupontEbitMargin',
  'novyMarxGpToAssets',
  'nonOperatingIncomeRatio',
  'croci',
  'croic',
  'roic',
  'roce',
  'greenblattRoc',
  'nissimPenmanRnoa',
  'famaFrenchOperatingProfitability',
  'consecutiveProfitYears',
  'grossMargin',
  'operatingMargin',
  'assetGrowth',
  'revenueGrowthRate',
  'netIncomeGrowthRate',
  'operatingIncomeGrowthRate',
  'equityGrowthRate',
  'bvpsGrowthRate',
  'epsGrowthRate',
  'rdIntensity',
  'sgr',
  'epsCagr3y',
  'epsCagr5y',
  'epsCagr8y',
  'revenueCagr3y',
  'revenueCagr5y',
  'revenueCagr8y',
  'buybackYield',
  'consecutiveDividendYears',
  'dividendCoverageRatio',
  'dividendGrowthRate3y',
  'dividendGrowthRate5y',
  'dividendGrowthRate8y',
  'shareCountChangeRate',
  'stockPrice',
  'marketCap',
  'bvps',
  'pbRatio',
  'peRatio',
  'psr',
  'pFcf',
  'fcfYield',
  'ncav',
  'evEbitda',
  'evToEbit',
  'evToFcf',
  'evToOcf',
  'evToSales',
  'priceToOcf',
  'grahamNumber',
  // greenblattEarningsYield 先不曝露稽核鏈（2026-09-14 使用者要求，跟 metricDefinitionRegistry
  // 移除是同一則決定，等神奇公式上線再一起合併回來）。
  'earningsYield',
  'tobinsQ',
  'pegRatio',
  'abnormalCapexRatio',
  'beneishAqi',
  'beneishDsri',
  'beneishMScore',
  'fcfConversionRate',
  'fcfMargin',
  'fcfPerShare',
  'ocfMargin',
  'ocfPerShare',
  'depreciationAmortizationPerShare',
  'ocfToNetIncome',
  'ownerEarnings',
  // 2026-09-21 web-nuxt 要求（徽章專頁的「計算依據表」是唯一的 SSR 表格，沒有稽核鏈就開不了專頁；
  // 杜邦頁要三因子都有鏈）：三支徽章指標 + 杜邦兩個因子。
  'earningsToRecordHigh',
  'threeMarginsRising',
  'shareholderYield',
  'assetTurnover',
  'equityMultiplier',
] as const;
export type ProvenanceMetricCode = (typeof PILOT_PROVENANCE_METRIC_CODES)[number];

export const provenanceEntrySchema = z.object({
  role: z.string().meta({ description: '這個值在公式裡代表什麼，人類可讀，例如「本季淨利（歸屬母公司）」' }),
  fiscalYear: z.number().nullable(),
  fiscalQuarter: z.number().nullable().meta({ description: '1-4；非季度性的值（例如市場快照）為 null' }),
  type: z.enum(['statementField', 'other']),
  statementType: z.enum(['balanceSheet', 'incomeStatement', 'cashFlowStatement']).nullable().meta({ description: '只有 type=statementField 時非 null' }),
  fieldKey: z
    .string()
    .nullable()
    .meta({ description: 'snake_case，跟 GET /companies/financial-statement 回傳的 XBRL key 完全一致，供前端直接連結；type=other 或該筆命中舊表 fallback 時為 null' }),
  sourceDescription: z.string().nullable().meta({ description: '只有 type=other 時非 null，例如「公開發行公司股本變動申報」或「舊表資料，非 XBRL」' }),
  value: z.union([z.string(), z.number()]).nullable(),
});
export type ProvenanceEntry = z.infer<typeof provenanceEntrySchema>;

export const metricProvenanceResultSchema = z.object({
  symbol: z.string(),
  metricCode: z.enum(PILOT_PROVENANCE_METRIC_CODES),
  found: z.boolean().meta({ description: 'false 代表查無資料，其餘欄位皆為 null/空陣列' }),
  fiscalYear: z.number().nullable(),
  fiscalQuarter: z.number().nullable(),
  value: z.union([z.string(), z.number()]).nullable().meta({ description: '該 metricCode 的最終計算結果，應跟對應 badge/metric-history 顯示的數字一致' }),
  entries: z.array(provenanceEntrySchema),
  methodologyNote: z
    .string()
    .nullable()
    .meta({ description: '部分指標的完整計算方法無法用單純的原始欄位清單完整呈現時的補充說明（例如 SUE 的 20 期標準差樣本未逐筆列出）；其餘指標為 null' }),
});
export type MetricProvenanceResult = z.infer<typeof metricProvenanceResultSchema>;

// 2026-09-13 抽出來共用——8 支 get<Metric>Provenance.ts 原本各自複製貼上一份幾乎一樣的
// 「bigint 轉字串、null/undefined 一律轉 null」轉換（3 種簽章都有：純 bigint|null、
// bigint|number|null、bigint|null|undefined），沒有一份跟 provenanceEntrySchema.value
// 的型別（string | number | null）搭配起來有實際差異，統一成這支涵蓋全部情境。
export const toProvenanceEntryValue = (value: bigint | number | null | undefined): string | number | null => {
  if (value === null || value === undefined) return null;
  return typeof value === 'bigint' ? value.toString() : value;
};
