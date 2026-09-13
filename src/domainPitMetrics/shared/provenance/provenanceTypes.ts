import { z } from 'zod';

// 2026-09-10：指標溯源（provenance）的共用型別。刻意「不」涵蓋全部 94 支 metricCode——
// PILOT_PROVENANCE_METRIC_CODES 是明確維護的試點清單，之後要擴大範圍必須逐一加進這個
// 清單 + 寫對應的 get<Metric>Provenance 函式，不會有「看起來支援但其實沒人測過」的
// 隱性涵蓋，這是吸取 dependsOn（沒有執行期消費者、範圍廣但沒人維護）的教訓，見
// GET /companies/piotroski-breakdown 同一天稍早的先例。第一批試點（2026-09-10）：
// sue/chowderNumber/roe。第二批試點（2026-09-11，web-nuxt 要求擴大到全部 16 支有
// badge 的指標，先做 2-3 支）：accrualsRatio/dividendPayoutRatio/altmanZScore。
// 第三批試點（2026-09-13，使用者詢問利息負擔/稅務負擔怎麼算，順便補上稽核鏈）：
// dupontTaxBurden/dupontInterestBurden。第四批試點（2026-09-13，使用者要求繼續擴大，
// 挑「營運效率」分類裡公式最單純的一批）：inventoryTurnover/receivablesTurnover/
// fixedAssetTurnover/payablesTurnover——這 4 支共用 resolveTurnoverRatioProvenanceInputs
// 這個共用 resolver。第五批試點（2026-09-13，同一天延續擴大）：inventoryDays/
// receivablesDays/payablesDays——這 3 支是對應周轉率的衍生轉換（Days = 365/周轉率），
// 稽核鏈列出的原始欄位跟對應周轉率完全一樣，methodologyNote 說明這層轉換。第六批試點
// （2026-09-13，同一天延續擴大）：cashConversionCycle/operatingCycle——這 2 支是天數
// 指標的二階衍生值（CCC = DIO+DSO−DPO，營運週期 = DIO+DSO），稽核鏈列出全部真正的原始
// 欄位（TTM 營業成本/營收 + 本季期末存貨/應收/應付），methodologyNote 說明完整推導鏈。
// 第七批試點（2026-09-13，同一天延續擴大，補完「營運效率」分類剩下 3 支簡單比率）：
// netWorkingCapitalTurnover/inventoryToRevenueRatio/receivablesToRevenueRatio——前者的
// 分母淨營運資金 = 流動資產−流動負債（中繼值，稽核鏈分開列出兩筆原始欄位），後兩者是
// 單純的資產負債表項目 / TTM 營收。第八批試點（2026-09-13，同一天延續擴大，補完
// 「營運效率」分類剩下 3 支較複雜的比率）：capexToRevenue/capexToOcfRatio/
// operatingExpenseRatio——前兩支的分子（資本支出）來源資料是負值，稽核鏈原樣列出、
// methodologyNote 說明取絕對值這一步；capexToOcfRatio 刻意不共用
// cashFlowValuationFamily 的 ttmComplete 旗標（那個旗標額外要求 revenue/netIncome
// 齊全，是給同家族其他指標用的，不是這支自己的真實依賴）。至此「營運效率」分類全部
// 16 支指標都有稽核鏈了（assetTurnover 算在 dupont family 那邊，不重複列）。目前全系統
// 117 支指標裡只有這 23 支有稽核鏈，其餘 94 支還沒有。第九批試點（2026-09-13，同一天
// 開始「財務韌性」分類）：currentRatio/quickRatio/cashRatio——純資產負債表時點快照，
// 只有 Q 一種 basis（沒有 TTM 概念），共用 resolveLiquidityRatioProvenanceInputs 這個
// 共用 resolver。第十批試點（2026-09-13，同一天延續「財務韌性」分類）：debtRatio/
// deRatio/equityRatio/cashToAssetsRatio——都是純資產負債表時點快照、只有 Q 一種 basis，
// 各自獨立一個檔案（不像 liquidityRatio 是同一個 family 編排檔案），沒有共用 resolver。
// deRatio 的權益是「歸屬母公司優先，缺漏退回整體口徑」的 pick 邏輯，equityRatio 固定用
// 整體權益，兩者刻意不同，稽核鏈各自反映實際用的 fieldKey。第十一批試點（2026-09-13，
// 同一天延續「財務韌性」分類）：financialLeverageDegree(DFL)/totalLeverageDegree(DTL)——
// 本季 vs 去年同季的 YoY 比較，都需要先組出 EPS(淨利/流通股數)當分子，共用
// resolveLeverageDegreeProvenanceInputs 這個共用 resolver，流通股數是「非財報欄位」
// （type='other'，公開發行公司股本變動申報），不是 statementField。第十二批試點
// （2026-09-13，同一天延續「財務韌性」分類，補完除了銀行/危機預警模型以外的剩餘 5 支）：
// interestCoverage/netDebtToEbitda/netWorkingCapitalToAssets/totalDebtToCapital/
// debtToFcf——有息負債/EBIT/EBITDA/淨負債/FCF 等中繼值都不是財報原始欄位，稽核鏈一律
// 分開列出真正的原始欄位，methodologyNote 說明推導關係。debtToFcf/netDebtToEbitda 都
// 刻意不共用 cashFlowValuationFamily 的 ttmComplete 旗標（理由同 capexToOcfRatio）。
// 至此「財務韌性」分類扣掉 5 支銀行專屬指標跟 4 個危機預警模型後全部有稽核鏈了。
// 第十三批試點（2026-09-13，同一天延續，補完危機預警模型）：
// altmanZDoublePrimeScore/zmijewskiScore/ohlsonOScore——都跟既有 altmanZScore 稽核鏈
// 同一個原則：只算原始分數，不套用製造業/金融業排除（那是寫入路徑另外決定的政策，
// 不是公式本身的計算）。ohlsonOScore 是 9 變數 Logit 模型，稽核鏈只列出真正的原始
// statementField（13 筆：本季資產負債表快照 4 筆＋今年 TTM 淨利 4 季＋去年同期 TTM
// 淨利 4 季＋今年 TTM 營業現金流 4 季），9 個中繼變數在 methodologyNote 說明算出來的
// 值，不逐一拆成 entries。之後有需要再逐一擴大。
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
