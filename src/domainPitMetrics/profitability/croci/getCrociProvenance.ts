import { resolveQuarterOrLatest } from '@/shared/sourceData/latestQuarter';
import { pickNetIncomeWithFieldKey as pickNetIncome } from '@/domainPitMetrics/shared/pickers';
import { getBalanceSheetXbrlFirst as getQuarterlyBalanceSheet } from '@/shared/sourceData/balanceSheetXbrlFirst';
import { getIncomeStatementXbrlFirst as getQuarterlyIncomeStatement } from '@/shared/sourceData/incomeStatementXbrlFirst';
import { getCashFlowStatementXbrlFirst as getQuarterlyCashFlowStatement } from '@/shared/sourceData/cashFlowStatementXbrlFirst';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/shared/rocQuarter';
import { toPercent } from '@/domainPitMetrics/shared/numericHelpers';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-13 使用者要求擴大稽核鏈——croci(TTM) = 近四季毛現金流（淨利+財務費用+折舊+攤銷）
// 加總 / 本季期末經濟資本（總資產-流動負債，單一期末值）。跟 computeCrociPit.ts 一致，是
// 簡化版 CROCI（不做通膨/資本化調整）。固定回傳 TTM。

export const getCrociProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet', 'incomeStatement', 'cashFlowStatement']);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'croci', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const balanceSheet = await getQuarterlyBalanceSheet({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const totalAssets = balanceSheet?.totalAssets ?? null;
  const currentLiabilities = balanceSheet?.currentLiabilities ?? null;
  const economicCapital = totalAssets !== null && currentLiabilities !== null ? totalAssets - currentLiabilities : null;

  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) =>
      Promise.all([
        getQuarterlyIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }),
        getQuarterlyCashFlowStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }),
      ])
    )
  );

  const netIncomes = ttmRecords.map(([incomeRecord]) => pickNetIncome(incomeRecord));
  const financeCosts = ttmRecords.map(([incomeRecord]) => incomeRecord?.financeCosts ?? null);
  const depreciations = ttmRecords.map(([, cashFlowRecord]) => cashFlowRecord?.depreciation ?? null);
  const amortizations = ttmRecords.map(([, cashFlowRecord]) => cashFlowRecord?.amortization ?? null);

  let grossCashFlowTtmSum = 0n;
  let complete = true;
  for (let i = 0; i < ttmRecords.length; i++) {
    if (netIncomes[i]!.value === null || financeCosts[i] === null || depreciations[i] === null || amortizations[i] === null) {
      complete = false;
    } else {
      grossCashFlowTtmSum += netIncomes[i]!.value! + financeCosts[i]! + depreciations[i]! + amortizations[i]!;
    }
  }

  const value = complete && economicCapital !== null ? toPercent(grossCashFlowTtmSum, economicCapital) : null;

  const entries: ProvenanceEntry[] = [
    { role: '本季期末總資產', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'assets', sourceDescription: null, value: toProvenanceEntryValue(totalAssets) },
    { role: '本季期末流動負債', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'current_liabilities', sourceDescription: null, value: toProvenanceEntryValue(currentLiabilities) },
    ...ttmQuarters.flatMap((tq, i): ProvenanceEntry[] => {
      const entryFiscalYear = rocYearToGregorian(Number(tq.year));
      const entryFiscalQuarter = Number(tq.season);
      return [
        {
          role: `TTM 淨利（第 ${i + 1}/4 季，用於毛現金流）`,
          fiscalYear: entryFiscalYear,
          fiscalQuarter: entryFiscalQuarter,
          type: 'statementField' as const,
          statementType: 'incomeStatement' as const,
          fieldKey: netIncomes[i]!.fieldKey,
          sourceDescription: null,
          value: toProvenanceEntryValue(netIncomes[i]!.value),
        },
        {
          role: `TTM 財務費用（第 ${i + 1}/4 季，用於毛現金流）`,
          fiscalYear: entryFiscalYear,
          fiscalQuarter: entryFiscalQuarter,
          type: 'statementField' as const,
          statementType: 'incomeStatement' as const,
          fieldKey: 'finance_costs',
          sourceDescription: null,
          value: toProvenanceEntryValue(financeCosts[i]),
        },
        {
          role: `TTM 折舊（第 ${i + 1}/4 季，用於毛現金流）`,
          fiscalYear: entryFiscalYear,
          fiscalQuarter: entryFiscalQuarter,
          type: 'statementField' as const,
          statementType: 'cashFlowStatement' as const,
          fieldKey: 'adj_depreciation_expense',
          sourceDescription: null,
          value: toProvenanceEntryValue(depreciations[i]),
        },
        {
          role: `TTM 攤銷（第 ${i + 1}/4 季，用於毛現金流）`,
          fiscalYear: entryFiscalYear,
          fiscalQuarter: entryFiscalQuarter,
          type: 'statementField' as const,
          statementType: 'cashFlowStatement' as const,
          fieldKey: 'adj_amortisation_expense',
          sourceDescription: null,
          value: toProvenanceEntryValue(amortizations[i]),
        },
      ];
    }),
  ];

  return {
    symbol,
    metricCode: 'croci',
    found: true,
    fiscalYear,
    fiscalQuarter: seasonNum,
    value,
    entries,
    methodologyNote:
      '分子毛現金流 = 淨利+財務費用+折舊+攤銷（TTM 加總，見上方原始欄位）。分母經濟資本 = 總資產-流動負債（本季期末快照，不平均不加總）。這是簡化版 CROCI，不做原始方法論的通膨/資本化調整。',
  };
};
