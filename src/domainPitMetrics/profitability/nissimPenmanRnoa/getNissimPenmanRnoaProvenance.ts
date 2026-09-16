import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { pickEquityWithFieldKey as pickEquity } from '@/domainPitMetrics/shared/pickers';
import { getBalanceSheetXbrlFirst as getQuarterlyBalanceSheet } from '@/infrastructure/repositories/mops/balanceSheetXbrlFirst';
import { getIncomeStatementXbrlFirst as getQuarterlyIncomeStatement } from '@/infrastructure/repositories/mops/incomeStatementXbrlFirst';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import { toPercent } from '@/domainPitMetrics/shared/numericHelpers';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-13 使用者要求擴大稽核鏈——nissimPenmanRnoa(TTM) = 近四季 NOPAT 加總 / 本季期末
// NOA（單一期末值）。NOPAT = 營業利益 × (1-有效稅率)，有效稅率 = 所得稅費用/稅前淨利
// （稅前淨利須為正）。NOA = 權益 + NFO，NFO(淨財務負債) = 有息負債(短期借款+應付公司債+
// 長期借款) - 現金及約當現金。跟 computeNissimPenmanRnoaPit.ts 一致，只遷移 RNOA 本身，
// 不遷移 FLEV/NBC/SPREAD 這些模型內部機制。固定回傳 TTM。

interface IncomeStatementSlice {
  operatingIncome: bigint | null;
  profitBeforeTax: bigint | null;
  incomeTaxExpense: bigint | null;
}

const calculateNopat = (record: IncomeStatementSlice | null): bigint | null => {
  if (!record || record.operatingIncome === null || record.profitBeforeTax === null || record.incomeTaxExpense === null || record.profitBeforeTax <= 0n) return null;
  const effectiveTaxRate = Number(record.incomeTaxExpense) / Number(record.profitBeforeTax);
  return BigInt(Math.round(Number(record.operatingIncome) * (1 - effectiveTaxRate)));
};

export const getNissimPenmanRnoaProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet', 'incomeStatement']);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'nissimPenmanRnoa', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const balanceSheet = await getQuarterlyBalanceSheet({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const interestBearingDebt = balanceSheet
    ? (balanceSheet.shortTermBorrowings ?? 0n) + (balanceSheet.bondsPayable ?? 0n) + (balanceSheet.longTermBorrowings ?? 0n)
    : null;
  const cashAndEquivalents = balanceSheet?.cashAndEquivalents ?? null;
  const equity = pickEquity(balanceSheet);
  const nfo = interestBearingDebt !== null && cashAndEquivalents !== null ? interestBearingDebt - cashAndEquivalents : null;
  const noa = nfo !== null && equity.value !== null ? equity.value + nfo : null;

  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => getQuarterlyIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );
  const operatingIncomes = ttmRecords.map((record) => record?.operatingIncome ?? null);
  const preTaxes = ttmRecords.map((record) => record?.profitBeforeTax ?? null);
  const incomeTaxExpenses = ttmRecords.map((record) => record?.incomeTaxExpense ?? null);

  let nopatTtmSum = 0n;
  let complete = true;
  for (const record of ttmRecords) {
    const nopat = calculateNopat(record);
    if (nopat === null) complete = false;
    else nopatTtmSum += nopat;
  }

  const value = complete && noa !== null ? toPercent(nopatTtmSum, noa) : null;

  const entries: ProvenanceEntry[] = [
    { role: '本季期末有息負債—短期借款', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'shortterm_borrowings', sourceDescription: null, value: toProvenanceEntryValue(balanceSheet?.shortTermBorrowings ?? null) },
    { role: '本季期末有息負債—應付公司債（非流動部分）', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'noncurrent_portion_of_bonds_issued', sourceDescription: null, value: toProvenanceEntryValue(balanceSheet?.bondsPayable ?? null) },
    { role: '本季期末有息負債—長期借款', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'longterm_borrowings', sourceDescription: null, value: toProvenanceEntryValue(balanceSheet?.longTermBorrowings ?? null) },
    { role: '本季期末現金及約當現金', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'cash_and_cash_equivalents', sourceDescription: null, value: toProvenanceEntryValue(cashAndEquivalents) },
    { role: '本季期末權益', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: equity.fieldKey, sourceDescription: null, value: toProvenanceEntryValue(equity.value) },
    ...ttmQuarters.flatMap((tq, i): ProvenanceEntry[] => {
      const entryFiscalYear = rocYearToGregorian(Number(tq.year));
      const entryFiscalQuarter = Number(tq.season);
      return [
        {
          role: `TTM 營業利益（第 ${i + 1}/4 季，用於 NOPAT）`,
          fiscalYear: entryFiscalYear,
          fiscalQuarter: entryFiscalQuarter,
          type: 'statementField' as const,
          statementType: 'incomeStatement' as const,
          fieldKey: 'profit_loss_from_operating_activities',
          sourceDescription: null,
          value: toProvenanceEntryValue(operatingIncomes[i]),
        },
        {
          role: `TTM 稅前淨利（第 ${i + 1}/4 季，用於 NOPAT 有效稅率）`,
          fiscalYear: entryFiscalYear,
          fiscalQuarter: entryFiscalQuarter,
          type: 'statementField' as const,
          statementType: 'incomeStatement' as const,
          fieldKey: 'profit_loss_before_tax',
          sourceDescription: null,
          value: toProvenanceEntryValue(preTaxes[i]),
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
    metricCode: 'nissimPenmanRnoa',
    found: true,
    fiscalYear,
    fiscalQuarter: seasonNum,
    value,
    entries,
    methodologyNote:
      'NOPAT（各季）= 營業利益 × (1-有效稅率)，有效稅率=所得稅費用/稅前淨利；稅前淨利非正時該季 NOPAT 視為 null。NOA(淨營運資產) = 權益 + NFO(淨財務負債)，NFO = 有息負債-現金及約當現金（本季期末快照，不平均不加總）。',
  };
};
