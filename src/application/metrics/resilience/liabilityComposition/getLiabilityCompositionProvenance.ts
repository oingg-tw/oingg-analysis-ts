import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import { toPercent } from '@/domain/metrics/shared/numericHelpers';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import type { BalanceSheetFields } from '@/application/ports/financialStatements';
import { liabilityBreakdown } from '@/domain/financials/liabilityBreakdown';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import type { PitDeps } from '@/application/metrics/deps';
import { LIABILITY_BREAKDOWN_CODES } from './computeLiabilityComposition';

// 2026-10-09 負債組成的溯源表（流動／非流動兩支＋逐科目九項共用，結構同 getDebtRatioProvenance.ts）：分子 ÷ 期末總資產 × 100。
// 值跟 compute 走同一個 liabilityBreakdown（缺行當 0、推算的其他、租賃抽取缺口給 null）。每一支列出組成分子的原始科目；
// 兩個「其他」是推算值，列出合計與每一個被扣掉的科目，讀者自己加減就能對上。
type Field = { role: string; fieldKey: string; pick: (bs: BalanceSheetFields) => bigint | null };
const f = (role: string, fieldKey: string, pick: Field['pick']): Field => ({ role, fieldKey, pick });

const SHORT_TERM = [f('短期借款', 'shortterm_borrowings', (b) => b.shortTermBorrowings), f('應付短期票券', 'current_cp_issued_and_portion', (b) => b.shortTermNotesAndBillsPayable)];
const PAYABLES = [
  f('應付帳款', 'trade_payables_to_trade_suppliers', (b) => b.accountsPayable),
  f('應付帳款－關係人', 'trade_payables_to_related_parties', (b) => b.tradePayablesToRelatedParties),
  f('應付票據', 'notes_payable', (b) => b.notesPayable),
];
const CONTRACT = [f('合約負債（流動）', 'current_contract_liabilities', (b) => b.currentContractLiabilities)];
const CURRENT_PORTION = [f('一年內到期長期負債', 'longterm_liabilities_current_portion', (b) => b.currentPortionOfLongTermLiabilities)];
const LONG_TERM = [f('長期借款', 'longterm_borrowings', (b) => b.longTermBorrowings)];
const BONDS = [f('應付公司債（非流動）', 'noncurrent_portion_of_bonds_issued', (b) => b.bondsPayable)];
const LEASE = [f('租賃負債（非流動）', 'noncurrent_lease_liabilities', (b) => b.noncurrentLeaseLiabilities)];
const minus = (fields: Field[]): Field[] => fields.map((x) => ({ ...x, role: `－${x.role}` }));

const PARTS: Record<string, { fields: Field[]; note: string | null }> = {
  currentLiabilitiesToAssets: { fields: [f('流動負債', 'current_liabilities', (b) => b.currentLiabilities)], note: null },
  nonCurrentLiabilitiesToAssets: { fields: [f('非流動負債', 'noncurrent_liabilities', (b) => b.noncurrentLiabilities)], note: null },
  shortTermBorrowingsToAssets: { fields: SHORT_TERM, note: null },
  accountsPayableToAssets: { fields: PAYABLES, note: null },
  contractLiabilitiesToAssets: { fields: CONTRACT, note: null },
  currentPortionOfLongTermDebtToAssets: { fields: CURRENT_PORTION, note: null },
  otherCurrentLiabilitiesToAssets: {
    fields: [f('流動負債', 'current_liabilities', (b) => b.currentLiabilities), ...minus([...SHORT_TERM, ...PAYABLES, ...CONTRACT, ...CURRENT_PORTION])],
    note: '其他流動負債不是申報科目，是流動負債減掉列出的各項推算出來的；沒有申報的科目視為 0。',
  },
  longTermBorrowingsToAssets: { fields: LONG_TERM, note: null },
  bondsPayableToAssets: { fields: BONDS, note: null },
  leaseLiabilitiesToAssets: { fields: LEASE, note: '流動租賃負債有值、非流動租賃負債缺行時，視為資料來源尚未抽取，不當成 0。' },
  otherNonCurrentLiabilitiesToAssets: {
    fields: [f('非流動負債', 'noncurrent_liabilities', (b) => b.noncurrentLiabilities), ...minus([...LONG_TERM, ...BONDS, ...LEASE])],
    note: '其他非流動負債不是申報科目，是非流動負債減掉列出的各項推算出來的；沒有申報的科目視為 0，非流動租賃負債缺行時不推算。',
  },
};

export type LiabilityCompositionCode = keyof typeof PARTS;

const numeratorOf = (metricCode: string, bs: BalanceSheetFields): bigint | null => {
  if (metricCode === 'currentLiabilitiesToAssets') return bs.currentLiabilities;
  if (metricCode === 'nonCurrentLiabilitiesToAssets') return bs.noncurrentLiabilities;
  return liabilityBreakdown(bs)[LIABILITY_BREAKDOWN_CODES[metricCode as keyof typeof LIABILITY_BREAKDOWN_CODES]];
};

export const getLiabilityCompositionProvenance =
  (metricCode: LiabilityCompositionCode, deps: Pick<PitDeps, 'statements' | 'quarters'>) =>
  async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
    const code = metricCode as MetricProvenanceResult['metricCode'];
    const { symbol, dataType, subsidiaryCompanyId } = query;
    const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet'], deps.quarters);
    if (!resolvedQuarter) {
      return { symbol, metricCode: code, found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
    }

    const rocYear = Number(resolvedQuarter.year);
    const seasonNum = Number(resolvedQuarter.season);
    const fiscalYear = rocYearToGregorian(rocYear);
    const part = PARTS[metricCode]!;

    const balanceSheet = await deps.statements.getBalanceSheet({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
    const numerator = balanceSheet ? numeratorOf(metricCode, balanceSheet) : null;
    const totalAssets = balanceSheet?.totalAssets ?? null;
    const value = numerator !== null && totalAssets !== null ? toPercent(numerator, totalAssets) : null;

    const entries: ProvenanceEntry[] = [
      ...part.fields.map(
        (x): ProvenanceEntry => ({ role: `本季期末${x.role}`, fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: x.fieldKey, sourceDescription: null, value: toProvenanceEntryValue(balanceSheet ? x.pick(balanceSheet) : null) })
      ),
      { role: '本季期末總資產', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'assets', sourceDescription: null, value: toProvenanceEntryValue(totalAssets) },
    ];

    return { symbol, metricCode: code, found: true, fiscalYear, fiscalQuarter: seasonNum, value, entries, methodologyNote: part.note };
  };
