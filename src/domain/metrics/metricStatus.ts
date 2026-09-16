import { z } from 'zod';

// 統一的「值為 null 時，原因是什麼」規範——2026-08-26 使用者要求，用 beta/ 當第一個試點。
//
// warnings 純文字陣列是給人看的，前端沒辦法用程式判斷「這個 null 是因為查無資料，還是這家公司
// 本來就不適用這個指標，還是算出來的數字沒有意義」。這三種情況前端應該顯示不同的 UI（例如
// 「查無資料」可能該顯示 loading/待補，「不適用」該直接隱藏這個指標不要顯示，「運算錯誤」可能是
// 真的要通報的異常）。
//
// 2026-09-04：一次性遷移完成，`domainMetrics/**` 底下全部 44 支「單一公司」指標都套用過
// 這份規範。2026-09-05 盤點發現：這些指標的 Result 從來不會直接回應給使用者（compute-on-miss
// 跟批次預算兩條production路徑都是「算完 upsert 進 DB 就丟棄回傳值」，HTTP 回應另外用
// filterCatalog.csv 驅動的 SQL 直接查表），fieldStatuses 因此在 domainMetrics 這邊完全是
// 死欄位（沒有存進 DB、沒有被讀取）——已從 `MetricResultMeta`／各指標的 Result 移除。
// `domainMacro`（equityRiskPremium/govBondYield10y）跟 `valuation/ranking` 不受影響：
// 兩者的 controller 都是 `res.json(result)` 直接把整個 Result 回應給使用者，fieldStatuses
// 是真的有用到的欄位，`MetricStatus`/`metricStatusSchema`/`buildFieldStatuses` 因此保留。
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

// domainMetrics 底下指標 Result 收尾共用的欄位——2026-09-05 從 36 支指標的 types.ts
// 逐字重複中抽出來，`XxxResult extends MetricResultMeta` 取代手寫這行。原本還有
// `fieldStatuses`，2026-09-05 稍晚確認 domainMetrics 的 Result 從不直接回應給使用者後
// 移除（見上方說明）。
export interface MetricResultMeta {
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
