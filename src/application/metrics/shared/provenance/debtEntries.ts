import type { BalanceSheetFields } from '@/application/ports/financialStatements';
import { toProvenanceEntryValue, type ProvenanceEntry } from './provenanceTypes';

// 2026-09-28 有息負債補齊後（domain/metrics/shared/pickers.ts interestBearingDebt），各支 provenance 在「短期借款／應付公司債／長期借款」
// 三列之後補上這兩列，讓稽核鏈的加總跟計算用的負債一致；netDebtToEbitda 另外加 S&P 調整後負債的租賃與退休金三列。
const entry = (role: string, fieldKey: string, value: bigint | null, fiscalYear: number, fiscalQuarter: number): ProvenanceEntry => ({
  role, fiscalYear, fiscalQuarter, type: 'statementField', statementType: 'balanceSheet', fieldKey, sourceDescription: null, value: toProvenanceEntryValue(value),
});

export const additionalDebtEntries = (bs: BalanceSheetFields | null, fiscalYear: number, fiscalQuarter: number, options: { sAndP?: boolean } = {}): ProvenanceEntry[] => [
  entry('本季期末有息負債—應付短期票券', 'current_cp_issued_and_portion', bs?.shortTermNotesAndBillsPayable ?? null, fiscalYear, fiscalQuarter),
  entry('本季期末有息負債—一年內到期長期負債（缺時為一年內到期公司債＋長期借款合計）', 'longterm_liabilities_current_portion', bs?.currentPortionOfLongTermLiabilities ?? null, fiscalYear, fiscalQuarter),
  ...(options.sAndP
    ? [
        entry('本季期末租賃負債—流動', 'current_lease_liabilities', bs?.currentLeaseLiabilities ?? null, fiscalYear, fiscalQuarter),
        entry('本季期末租賃負債—非流動', 'noncurrent_lease_liabilities', bs?.noncurrentLeaseLiabilities ?? null, fiscalYear, fiscalQuarter),
        entry('本季期末淨確定福利負債（計入 80%，扣 20% 稅效果）', 'noncurrent_liabilities_defined_benefit', bs?.netDefinedBenefitLiability ?? null, fiscalYear, fiscalQuarter),
      ]
    : []),
];
