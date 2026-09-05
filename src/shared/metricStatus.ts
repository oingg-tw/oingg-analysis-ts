import { z } from 'zod';

// 統一的「值為 null 時，原因是什麼」規範——2026-08-26 使用者要求，用 beta/ 當第一個試點。
//
// warnings 純文字陣列是給人看的，前端沒辦法用程式判斷「這個 null 是因為查無資料，還是這家公司
// 本來就不適用這個指標，還是算出來的數字沒有意義」。這三種情況前端應該顯示不同的 UI（例如
// 「查無資料」可能該顯示 loading/待補，「不適用」該直接隱藏這個指標不要顯示，「運算錯誤」可能是
// 真的要通報的異常）。
//
// 2026-09-04：一次性遷移完成，`domainMetrics/**` 底下全部 44 支「單一公司」指標
// 都已經套用這份規範（每支的 types.ts 有 `fieldStatuses: Record<string, MetricStatus>`，
// service.ts 有對應的 `buildFieldStatuses` 呼叫）。唯一沒套用的是 `valuation/ranking`——
// 它回傳的是跨公司排行陣列（`RankingRow[]`），不是「單一實體、固定欄位」的形狀，這份規範
// 的「某個欄位是 null」語意套不上去，刻意不勉強套用。之後新增指標時，這份規範是預設要遵循
// 的慣例，不是可有可無的選項。
// 2026-09-05 起改成 zod schema 當唯一真理來源（見檔案開頭「一次性遷移完成」的說明之後又追加
// 這次調整）——這個型別會直接出現在多支指標的 HTTP 回應裡，@asteasolutions/zod-to-openapi
// 需要 schema 才能產生對應的 Swagger 文件，TypeScript 型別用 z.infer 反推，不再手寫 interface。
export const metricStatusCodeSchema = z.enum(['no_data', 'not_applicable', 'calculation_error']).meta({
  description:
    'no_data=必要的原始資料查不到，上游補齊後會自動變成有值，不是永久性的；' +
    'not_applicable=這個指標對查詢對象結構性不適用，不會因為時間過去而自己變成可以算；' +
    'calculation_error=資料都有，但套公式時數學上算不出有意義的值（除以零、分母不合理⋯⋯）。',
});
export type MetricStatusCode = z.infer<typeof metricStatusCodeSchema>;

export const metricStatusSchema = z.object({
  status: metricStatusCodeSchema,
  message: z.string().meta({ description: '人類可讀的原因，跟 warnings 陣列同一種語氣/風格' }),
});
export type MetricStatus = z.infer<typeof metricStatusSchema>;

// 全部「單一實體、固定欄位」指標 Result 收尾共用的欄位——2026-09-05 從 36 支指標的
// types.ts 逐字重複中抽出來，`XxxResult extends MetricResultMeta` 取代手寫這兩行。
export interface MetricResultMeta {
  fieldStatuses: Record<string, MetricStatus>;
  warnings: string[];
}

// 建構回應裡的 fieldStatuses 物件時的小工具——只放「值是 null」的欄位，算出值的欄位不需要出現在這裡
// （沒有出現 = 正常算出來了），維持 payload 精簡，也不用每個欄位都寫一個 'ok' 進去。
export const buildFieldStatuses = (entries: Array<[field: string, status: MetricStatus] | null>): Record<string, MetricStatus> => {
  const result: Record<string, MetricStatus> = {};
  for (const entry of entries) {
    if (entry === null) continue;
    const [field, status] = entry;
    result[field] = status;
  }
  return result;
};
