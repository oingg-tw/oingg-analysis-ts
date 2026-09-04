// 統一的「值為 null 時，原因是什麼」規範——2026-08-26 使用者要求，用 beta/ 當第一個試點。
//
// warnings 純文字陣列是給人看的，前端沒辦法用程式判斷「這個 null 是因為查無資料，還是這家公司
// 本來就不適用這個指標，還是算出來的數字沒有意義」。這三種情況前端應該顯示不同的 UI（例如
// 「查無資料」可能該顯示 loading/待補，「不適用」該直接隱藏這個指標不要顯示，「運算錯誤」可能是
// 真的要通報的異常）。
//
// 2026-09-04：一次性遷移完成，`domainBatch/metrics/**` 底下全部 44 支「單一公司」指標
// 都已經套用這份規範（每支的 types.ts 有 `fieldStatuses: Record<string, MetricStatus>`，
// service.ts 有對應的 `buildFieldStatuses` 呼叫）。唯一沒套用的是 `valuation/ranking`——
// 它回傳的是跨公司排行陣列（`RankingRow[]`），不是「單一實體、固定欄位」的形狀，這份規範
// 的「某個欄位是 null」語意套不上去，刻意不勉強套用。之後新增指標時，這份規範是預設要遵循
// 的慣例，不是可有可無的選項。
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
