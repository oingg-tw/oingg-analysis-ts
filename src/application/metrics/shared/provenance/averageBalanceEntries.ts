import type { BalanceSheetFields } from '@/application/ports/financialStatements';
import { pickEquityWithFieldKey } from '@/domain/metrics/shared/pickers';
import type { AverageBalances } from '../averageBalances';
import { toProvenanceEntryValue, type ProvenanceEntry } from './provenanceTypes';

// 2026-10-01 溯源表對帳發現：2026-09-22 分母改期間平均（shared/averageBalances.ts）後，週轉率家族、assetTurnover、roa、croci、
// roic、RNOA、sgr 的溯源表還在用本季期末值，value 跟儲存值對不上。各支 provenance 改成直接拿 compute 的 resolver
// 結果，這裡統一產生「平均分母第 i/N 點」的逐點列表——N 跟 compute 同一個 ttmPointIndexes（上市櫃 5 點、興櫃半年頻 3 點），
// 讀者能自己把各點加起來平均、對上最後的平均值。roe 的寫法（getRoeProvenance.ts）是同一個格式的先例。
// 複合分母（投入資本、NOA、淨營運資金、經濟資本）每一點逐一列出組成欄位，不只列相減後的中繼值。
export interface BalanceComponent {
  label: string; // 例如「存貨」「流動資產」
  fieldKey: string | null | ((bs: BalanceSheetFields | null) => string | null); // 權益這類「優先母公司、缺漏退回整體」的欄位每一點命中的 key 可能不同
  pick: (bs: BalanceSheetFields) => bigint | null;
}

export const averageBalanceEntries = (balances: AverageBalances, components: BalanceComponent[]): ProvenanceEntry[] =>
  balances.ttmPointIndexes.flatMap((idx, k) => {
    const q = balances.quarters[idx]!;
    const bs = balances.balanceSheets[idx] ?? null;
    return components.map(
      (c): ProvenanceEntry => ({
        role: `平均分母第 ${k + 1}/${balances.ttmPointIndexes.length} 點（${q.year} 年第 ${q.season} 季末${c.label}）`,
        fiscalYear: q.fiscalYear,
        fiscalQuarter: q.fiscalQuarter,
        type: 'statementField',
        statementType: 'balanceSheet',
        fieldKey: typeof c.fieldKey === 'function' ? c.fieldKey(bs) : c.fieldKey,
        sourceDescription: null,
        value: toProvenanceEntryValue(bs ? c.pick(bs) : null),
      })
    );
  });

// 平均後的分母本身（計算值，不是財報欄位）——任一點缺漏時為 null，跟 compute 的 averageBalance 一致。
export const averagedDenominatorEntry = (label: string, balances: AverageBalances, value: bigint | null): ProvenanceEntry => ({
  role: `${label}（${balances.ttmPointIndexes.length} 點平均）`,
  fiscalYear: null,
  fiscalQuarter: null,
  type: 'other',
  statementType: null,
  fieldKey: null,
  sourceDescription: '上列各季末值的平均（計算值）',
  value: toProvenanceEntryValue(value),
});

// roic 的投入資本與 RNOA 的 NOA 是同一個組合：有息負債（domain/metrics/shared/pickers.ts interestBearingDebt 的五項，
// fieldKey 跟 debtEntries.ts 一致）＋權益（優先母公司）－現金及約當現金。
export const investedCapitalComponents: BalanceComponent[] = [
  { label: '有息負債—短期借款', fieldKey: 'shortterm_borrowings', pick: (bs) => bs.shortTermBorrowings },
  { label: '有息負債—應付短期票券', fieldKey: 'current_cp_issued_and_portion', pick: (bs) => bs.shortTermNotesAndBillsPayable },
  { label: '有息負債—一年內到期長期負債（缺時為一年內到期公司債＋長期借款合計）', fieldKey: 'longterm_liabilities_current_portion', pick: (bs) => bs.currentPortionOfLongTermLiabilities },
  { label: '有息負債—應付公司債（非流動部分）', fieldKey: 'noncurrent_portion_of_bonds_issued', pick: (bs) => bs.bondsPayable },
  { label: '有息負債—長期借款', fieldKey: 'longterm_borrowings', pick: (bs) => bs.longTermBorrowings },
  { label: '權益', fieldKey: (bs) => pickEquityWithFieldKey(bs).fieldKey, pick: (bs) => pickEquityWithFieldKey(bs).value },
  { label: '現金及約當現金', fieldKey: 'cash_and_cash_equivalents', pick: (bs) => bs.cashAndEquivalents },
];
