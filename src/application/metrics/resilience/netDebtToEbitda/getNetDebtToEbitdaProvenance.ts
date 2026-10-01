import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import { resolveTrailingCashFlowStatements, resolveTrailingIncomeStatements, trailingPeriodLabel } from '../../shared/trailingYear';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import { additionalDebtEntries } from '@/application/metrics/shared/provenance/debtEntries';
import { sAndPAdjustedDebt } from './computeNetDebtToEbitda';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-13 使用者要求擴大稽核鏈——netDebtToEbitda = 淨負債(本季期末快照) / EBITDA(TTM
// 加總)。淨負債 = 有息負債(短期借款+應付公司債+長期借款) − 現金及約當現金；EBITDA =
// 稅前淨利+財務費用+折舊+攤銷。跟 computeNetDebtToEbitdaPit.ts 的 TTM 版本一致，固定
// 回傳 TTM。

export const getNetDebtToEbitdaProvenance = async (query: QuarterlyMetricQuery, deps: Pick<PitDeps, 'statements' | 'quarters' | 'cumulativeStatements'>): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet', 'incomeStatement', 'cashFlowStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'netDebtToEbitda', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const balanceSheet = await deps.statements.getBalanceSheet({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const shortTermBorrowings = balanceSheet?.shortTermBorrowings ?? null;
  const bondsPayable = balanceSheet?.bondsPayable ?? null;
  const longTermBorrowings = balanceSheet?.longTermBorrowings ?? null;
  const cashAndEquivalents = balanceSheet?.cashAndEquivalents ?? null;
  const totalDebt = balanceSheet ? sAndPAdjustedDebt(balanceSheet) : null;
  const netDebt = totalDebt !== null && cashAndEquivalents !== null ? totalDebt - cashAndEquivalents : null;

  // 2026-10-01 近一年改走共用來源，跟 compute 同一份資料（興櫃半年頻，見 shared/trailingYear.ts）；損益表與現金流量表的 periods 順序相同。
  const trailingKey = { symbol, rocYear, season: season as Season, dataType, subsidiaryCompanyId };
  const [trailingIncome, trailingCashFlow] = await Promise.all([resolveTrailingIncomeStatements(trailingKey, deps), resolveTrailingCashFlowStatements(trailingKey, deps)]);
  const ttmQuarters = trailingIncome.periods;
  const ttmRecords = trailingIncome.periods.map((p, i) => [p.record, trailingCashFlow.periods[i]?.record ?? null] as const);

  const preTaxes = ttmRecords.map(([income]) => income?.profitBeforeTax ?? null);
  const financeCosts = ttmRecords.map(([income]) => income?.financeCosts ?? null);
  const depreciations = ttmRecords.map(([, cashFlow]) => cashFlow?.depreciation ?? null);
  const amortizations = ttmRecords.map(([, cashFlow]) => cashFlow?.amortization ?? null);

  let ebitdaTtmSum = 0n;
  let complete = true;
  for (let i = 0; i < ttmRecords.length; i++) {
    if (preTaxes[i] === null || financeCosts[i] === null || depreciations[i] === null || amortizations[i] === null) {
      complete = false;
    } else {
      ebitdaTtmSum += preTaxes[i]! + financeCosts[i]! + depreciations[i]! + amortizations[i]!;
    }
  }

  const value = complete && netDebt !== null && ebitdaTtmSum > 0n ? Math.round((Number(netDebt) / Number(ebitdaTtmSum)) * 100) / 100 : null;

  const entries: ProvenanceEntry[] = [
    { role: '本季期末短期借款', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'shortterm_borrowings', sourceDescription: null, value: toProvenanceEntryValue(shortTermBorrowings) },
    {
      role: '本季期末應付公司債（非流動部分）',
      fiscalYear,
      fiscalQuarter: seasonNum,
      type: 'statementField',
      statementType: 'balanceSheet',
      fieldKey: 'noncurrent_portion_of_bonds_issued',
      sourceDescription: null,
      value: toProvenanceEntryValue(bondsPayable),
    },
    {
      role: '本季期末長期借款',
      fiscalYear,
      fiscalQuarter: seasonNum,
      type: 'statementField',
      statementType: 'balanceSheet',
      fieldKey: 'longterm_borrowings',
      sourceDescription: null,
      value: toProvenanceEntryValue(longTermBorrowings),
    },
    ...additionalDebtEntries(balanceSheet, fiscalYear, seasonNum, { sAndP: true }),
    {
      role: '本季期末現金及約當現金',
      fiscalYear,
      fiscalQuarter: seasonNum,
      type: 'statementField',
      statementType: 'balanceSheet',
      fieldKey: 'cash_and_cash_equivalents',
      sourceDescription: null,
      value: toProvenanceEntryValue(cashAndEquivalents),
    },
    ...ttmQuarters.flatMap((tq, i): ProvenanceEntry[] => {
      const entryFiscalYear = rocYearToGregorian(Number(tq.year));
      const entryFiscalQuarter = Number(tq.season);
      return [
        {
          role: `近一年 稅前淨利（${trailingPeriodLabel(tq, trailingIncome.basis)}，用於 EBITDA）`,
          fiscalYear: entryFiscalYear,
          fiscalQuarter: entryFiscalQuarter,
          type: 'statementField',
          statementType: 'incomeStatement',
          fieldKey: 'profit_loss_before_tax',
          sourceDescription: null,
          value: toProvenanceEntryValue(preTaxes[i]),
        },
        {
          role: `近一年 財務費用（${trailingPeriodLabel(tq, trailingIncome.basis)}，用於 EBITDA）`,
          fiscalYear: entryFiscalYear,
          fiscalQuarter: entryFiscalQuarter,
          type: 'statementField',
          statementType: 'incomeStatement',
          fieldKey: 'finance_costs',
          sourceDescription: null,
          value: toProvenanceEntryValue(financeCosts[i]),
        },
        {
          role: `近一年 折舊（${trailingPeriodLabel(tq, trailingIncome.basis)}，用於 EBITDA）`,
          fiscalYear: entryFiscalYear,
          fiscalQuarter: entryFiscalQuarter,
          type: 'statementField',
          statementType: 'cashFlowStatement',
          fieldKey: 'adj_depreciation_expense',
          sourceDescription: null,
          value: toProvenanceEntryValue(depreciations[i]),
        },
        {
          role: `近一年 攤銷（${trailingPeriodLabel(tq, trailingIncome.basis)}，用於 EBITDA）`,
          fiscalYear: entryFiscalYear,
          fiscalQuarter: entryFiscalQuarter,
          type: 'statementField',
          statementType: 'cashFlowStatement',
          fieldKey: 'adj_amortisation_expense',
          sourceDescription: null,
          value: toProvenanceEntryValue(amortizations[i]),
        },
      ];
    }),
  ];

  return {
    symbol,
    metricCode: 'netDebtToEbitda',
    found: true,
    fiscalYear,
    fiscalQuarter: seasonNum,
    value,
    entries,
    methodologyNote: `分子淨負債 = 有息負債(短期借款+應付公司債+長期借款) − 現金及約當現金（見上方前 4 筆原始欄位），淨負債＝${netDebt ?? 'null'}。分母 EBITDA = 稅前淨利+財務費用+折舊+攤銷 逐季加總，本身不是財報原始欄位。`,
  };
};
