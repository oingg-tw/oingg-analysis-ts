// 2026-09-10：欄位代碼→中文標籤字典，只收 3 支試點指標（sue/chowderNumber/roe）實際
// 用到的欄位，刻意不預先覆蓋全部 94 支指標可能用到的欄位——之後每加一支新的試點指標，
// 才對應補上那支真正會用到的欄位，理由同 provenanceTypes.ts 的說明。這裡的 fieldKey
// 已經逐一對照過 balanceSheetXbrlFirst.ts/incomeStatementXbrlFirst.ts/
// cashFlowStatementXbrlFirst.ts 的原始碼確認過真的存在，不是猜的。

export interface StatementFieldLabel {
  fieldKey: string;
  statementType: 'balanceSheet' | 'incomeStatement' | 'cashFlowStatement';
  label: string;
}

export const PILOT_PROVENANCE_FIELD_LABELS: readonly StatementFieldLabel[] = [
  { fieldKey: 'equity_attributable_to_owners_of_parent', statementType: 'balanceSheet', label: '歸屬母公司業主之權益' },
  { fieldKey: 'equity', statementType: 'balanceSheet', label: '權益總額（無歸屬母公司細分時的替代欄位）' },
  { fieldKey: 'profit_loss_attributable_to_owners_of_parent', statementType: 'incomeStatement', label: '本期淨利（歸屬母公司業主）' },
  { fieldKey: 'profit_loss', statementType: 'incomeStatement', label: '本期淨利（無歸屬母公司細分時的替代欄位）' },
  { fieldKey: 'dividends_paid_financing', statementType: 'cashFlowStatement', label: '發放現金股利（融資活動）' },
];

const FIELD_LABEL_MAP = new Map(PILOT_PROVENANCE_FIELD_LABELS.map((entry) => [entry.fieldKey, entry]));

export const getStatementFieldLabel = (fieldKey: string): StatementFieldLabel | null => FIELD_LABEL_MAP.get(fieldKey) ?? null;
