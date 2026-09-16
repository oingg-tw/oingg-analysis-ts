import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { pickEquityWithFieldKey as pickEquity } from '@/domain/metrics/shared/pickers';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import { toPercent } from '@/domain/metrics/shared/numericHelpers';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-13 使用者要求擴大稽核鏈——roic(TTM) = 近四季 NOPAT 加總 / 投入資本（本季期末
// 快照，有息負債+權益-現金）。NOPAT = (稅前淨利+財務費用) × (1-有效稅率)，有效稅率 =
// 所得稅費用/稅前淨利，稅前淨利須為正否則 NOPAT 視為 null（跟 computeRoicPit.ts 一致）。
// 固定回傳 TTM。NOPAT 是計算出的中繼值不是原始欄位，用 methodologyNote 逐季說明換算，
// 三個組成欄位（稅前淨利/財務費用/所得稅費用）都列成 entries。

const computeNopat = (record: { profitBeforeTax: bigint | null; financeCosts: bigint | null; incomeTaxExpense: bigint | null } | null): bigint | null => {
  if (!record || record.profitBeforeTax === null || record.financeCosts === null || record.incomeTaxExpense === null) return null;
  if (record.profitBeforeTax <= 0n) return null;
  const ebit = record.profitBeforeTax + record.financeCosts;
  const effectiveTaxRate = Number(record.incomeTaxExpense) / Number(record.profitBeforeTax);
  return BigInt(Math.round(Number(ebit) * (1 - effectiveTaxRate)));
};

export const getRoicProvenance = async (query: QuarterlyMetricQuery, deps: Pick<PitDeps, 'statements' | 'quarters'>): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet', 'incomeStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'roic', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const balanceSheet = await deps.statements.getBalanceSheet({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const equity = pickEquity(balanceSheet);
  const totalDebt = balanceSheet
    ? (balanceSheet.shortTermBorrowings ?? 0n) + (balanceSheet.bondsPayable ?? 0n) + (balanceSheet.longTermBorrowings ?? 0n)
    : null;
  const cashAndEquivalents = balanceSheet?.cashAndEquivalents ?? null;
  const investedCapital = totalDebt !== null && equity.value !== null && cashAndEquivalents !== null ? totalDebt + equity.value - cashAndEquivalents : null;

  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => deps.statements.getIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );
  const preTaxes = ttmRecords.map((record) => record?.profitBeforeTax ?? null);
  const financeCosts = ttmRecords.map((record) => record?.financeCosts ?? null);
  const incomeTaxExpenses = ttmRecords.map((record) => record?.incomeTaxExpense ?? null);
  const nopats = ttmRecords.map(computeNopat);

  let nopatTtmSum = 0n;
  let complete = true;
  for (const nopat of nopats) {
    if (nopat === null) complete = false;
    else nopatTtmSum += nopat;
  }

  const value = complete && investedCapital !== null ? toPercent(nopatTtmSum, investedCapital) : null;

  const entries: ProvenanceEntry[] = [
    { role: '本季期末有息負債—短期借款', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'shortterm_borrowings', sourceDescription: null, value: toProvenanceEntryValue(balanceSheet?.shortTermBorrowings ?? null) },
    { role: '本季期末有息負債—應付公司債（非流動部分）', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'noncurrent_portion_of_bonds_issued', sourceDescription: null, value: toProvenanceEntryValue(balanceSheet?.bondsPayable ?? null) },
    { role: '本季期末有息負債—長期借款', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'longterm_borrowings', sourceDescription: null, value: toProvenanceEntryValue(balanceSheet?.longTermBorrowings ?? null) },
    { role: '本季期末權益', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: equity.fieldKey, sourceDescription: null, value: toProvenanceEntryValue(equity.value) },
    { role: '本季期末現金及約當現金', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'cash_and_cash_equivalents', sourceDescription: null, value: toProvenanceEntryValue(cashAndEquivalents) },
    ...ttmQuarters.flatMap((tq, i): ProvenanceEntry[] => {
      const entryFiscalYear = rocYearToGregorian(Number(tq.year));
      const entryFiscalQuarter = Number(tq.season);
      return [
        {
          role: `TTM 稅前淨利（第 ${i + 1}/4 季，用於 NOPAT）`,
          fiscalYear: entryFiscalYear,
          fiscalQuarter: entryFiscalQuarter,
          type: 'statementField' as const,
          statementType: 'incomeStatement' as const,
          fieldKey: 'profit_loss_before_tax',
          sourceDescription: null,
          value: toProvenanceEntryValue(preTaxes[i]),
        },
        {
          role: `TTM 財務費用（第 ${i + 1}/4 季，用於 NOPAT）`,
          fiscalYear: entryFiscalYear,
          fiscalQuarter: entryFiscalQuarter,
          type: 'statementField' as const,
          statementType: 'incomeStatement' as const,
          fieldKey: 'finance_costs',
          sourceDescription: null,
          value: toProvenanceEntryValue(financeCosts[i]),
        },
        {
          role: `TTM 所得稅費用（第 ${i + 1}/4 季，用於 NOPAT 有效稅率）`,
          fiscalYear: entryFiscalYear,
          fiscalQuarter: entryFiscalQuarter,
          type: 'statementField' as const,
          statementType: 'incomeStatement' as const,
          fieldKey: 'income_tax_expense_continuing_operations',
          sourceDescription: null,
          value: toProvenanceEntryValue(incomeTaxExpenses[i]),
        },
      ];
    }),
  ];

  return {
    symbol,
    metricCode: 'roic',
    found: true,
    fiscalYear,
    fiscalQuarter: seasonNum,
    value,
    entries,
    methodologyNote:
      'NOPAT（各季）= (稅前淨利+財務費用) × (1-有效稅率)，有效稅率=所得稅費用/稅前淨利；稅前淨利非正時該季 NOPAT 視為 null。投入資本 = 有息負債+權益-現金及約當現金（本季期末快照，不平均不加總）。',
  };
};
