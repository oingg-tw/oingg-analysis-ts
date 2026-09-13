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
// 這個共用 resolver。目前全系統 117 支指標裡只有這 12 支有稽核鏈，其餘 105 支還沒有，
// 之後有需要再逐一擴大。
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
