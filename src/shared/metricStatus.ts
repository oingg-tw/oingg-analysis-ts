// 統一的「值為 null 時，原因是什麼」規範——2026-08-26 使用者要求，用 beta/ 當第一個試點。
//
// 現有 21 支已實作的指標都是「值為 null + warnings 純文字說明原因」這種寫法，warnings 是給人看的，
// 前端沒辦法用程式判斷「這個 null 是因為查無資料，還是這家公司本來就不適用這個指標，還是算出來的
// 數字沒有意義」。這三種情況前端應該顯示不同的 UI（例如「查無資料」可能該顯示 loading/待補，
// 「不適用」該直接隱藏這個指標不要顯示，「運算錯誤」可能是真的要通報的異常）。
//
// **這個規範目前只套用在 beta/，其他 21 支既有指標還沒有回頭套用**——那是規模更大的一次性遷移
// （每支的 types.ts/service.ts/測試都要動，也是 API 回應格式的擴充），要不要做、什麼時候做，
// 是另一個決定，不要因為看到這個檔案就順手去改其他指標。
export type MetricStatusCode =
  | 'no_data' // 必要的原始資料在資料庫裡查不到——整筆記錄不存在，或關鍵欄位是 null。上游把資料補齊後，重新查詢就會有值，不是永久性的。
  | 'not_applicable' // 資料庫有資料，但這個指標/公式對查詢對象「結構性」不適用（例如這個 symbol 目前完全沒有股價序列），不會因為時間過去而自己變成可以算。
  | 'calculation_error'; // 資料都有，但套公式時數學上算不出有意義的值（除以零、分母不合理、樣本數不足以算統計量⋯⋯）。

export interface MetricStatus {
  status: MetricStatusCode;
  message: string; // 人類可讀的原因，跟既有 warnings 陣列同一種語氣/風格，方便沿用既有寫法
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
