// 從財報記錄挑「優先歸屬母公司口徑，缺漏才退回整體口徑」——netIncome/equity 這兩組欄位的
// 判斷規則在全 repo 幾十支 compute*Pit.ts/get*Provenance.ts 裡各自重複定義同一段邏輯，
// 2026-09-13 從 dupont 專屬的 pickers.ts 提升成通用共用檔案。每組欄位提供三種回傳形狀，
// 對應既有程式碼裡三種不同的呼叫慣例，呼叫端各自 import 需要的那一種，不用強迫改寫呼叫端：
// - pickXxxValue：直接回傳 bigint | null（不包一層）。
// - pickXxx：回傳 { value: bigint | null }（大多數 compute*Pit.ts 的慣例）。
// - pickXxxWithFieldKey：額外回傳實際命中哪個 fieldKey，給稽核鏈 provenance 顯示用。

export interface PickedField {
  value: bigint | null;
  fieldKey: string | null;
}

interface NetIncomeRecord {
  netIncomeAttributableToParent: bigint | null;
  netIncome: bigint | null;
}

export const pickNetIncomeValue = (record: NetIncomeRecord | null): bigint | null => {
  if (!record) return null;
  if (record.netIncomeAttributableToParent !== null) return record.netIncomeAttributableToParent;
  return record.netIncome;
};

export const pickNetIncome = (record: NetIncomeRecord | null): { value: bigint | null } => ({
  value: pickNetIncomeValue(record),
});

export const pickNetIncomeWithFieldKey = (record: NetIncomeRecord | null): PickedField => {
  if (!record) return { value: null, fieldKey: null };
  if (record.netIncomeAttributableToParent !== null) return { value: record.netIncomeAttributableToParent, fieldKey: 'profit_loss_attributable_to_owners_of_parent' };
  if (record.netIncome !== null) return { value: record.netIncome, fieldKey: 'profit_loss' };
  return { value: null, fieldKey: null };
};

interface EquityRecord {
  equityAttributableToParent: bigint | null;
  totalEquity: bigint | null;
}

export const pickEquityValue = (record: EquityRecord | null): bigint | null => {
  if (!record) return null;
  if (record.equityAttributableToParent !== null) return record.equityAttributableToParent;
  return record.totalEquity;
};

export const pickEquity = (record: EquityRecord | null): { value: bigint | null } => ({
  value: pickEquityValue(record),
});

export const pickEquityWithFieldKey = (record: EquityRecord | null): PickedField => {
  if (!record) return { value: null, fieldKey: null };
  if (record.equityAttributableToParent !== null) return { value: record.equityAttributableToParent, fieldKey: 'equity_attributable_to_owners_of_parent' };
  if (record.totalEquity !== null) return { value: record.totalEquity, fieldKey: 'equity' };
  return { value: null, fieldKey: null };
};
