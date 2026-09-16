import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { pickEquityWithFieldKey as pickEquity } from '@/domain/metrics/shared/pickers';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import { toPercent } from '@/domain/metrics/shared/numericHelpers';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-13 使用者要求擴大稽核鏈——famaFrenchOperatingProfitability(TTM) = 近四季
// 營業獲利(毛利-推銷費用-管理費用-利息費用)加總 / 本季期末帳面權益（單一期末值）。跟
// computeFamaFrenchOperatingProfitabilityPit.ts 一致，只做 Fama-French RMW 因子背後的
// 單一公司比率本身，不做完整五因子模型的橫斷面排序建構+迴歸。固定回傳 TTM。

export const getFamaFrenchOperatingProfitabilityProvenance = async (query: QuarterlyMetricQuery, deps: Pick<PitDeps, 'statements' | 'quarters'>): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet', 'incomeStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'famaFrenchOperatingProfitability', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const balanceSheet = await deps.statements.getBalanceSheet({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const bookEquity = pickEquity(balanceSheet);

  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => deps.statements.getIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );
  const grossProfits = ttmRecords.map((record) => record?.grossProfit ?? null);
  const sellingExpenses = ttmRecords.map((record) => record?.sellingExpenses ?? null);
  const adminExpenses = ttmRecords.map((record) => record?.adminExpenses ?? null);
  const financeCosts = ttmRecords.map((record) => record?.financeCosts ?? null);

  let operatingProfitTtmSum = 0n;
  let complete = true;
  for (let i = 0; i < ttmRecords.length; i++) {
    if (grossProfits[i] === null || sellingExpenses[i] === null || adminExpenses[i] === null || financeCosts[i] === null) {
      complete = false;
    } else {
      operatingProfitTtmSum += grossProfits[i]! - sellingExpenses[i]! - adminExpenses[i]! - financeCosts[i]!;
    }
  }

  const value = complete && bookEquity.value !== null ? toPercent(operatingProfitTtmSum, bookEquity.value) : null;

  const entries: ProvenanceEntry[] = [
    { role: '本季期末帳面權益', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: bookEquity.fieldKey, sourceDescription: null, value: toProvenanceEntryValue(bookEquity.value) },
    ...ttmQuarters.flatMap((tq, i): ProvenanceEntry[] => {
      const entryFiscalYear = rocYearToGregorian(Number(tq.year));
      const entryFiscalQuarter = Number(tq.season);
      return [
        {
          role: `TTM 毛利（第 ${i + 1}/4 季，用於營業獲利）`,
          fiscalYear: entryFiscalYear,
          fiscalQuarter: entryFiscalQuarter,
          type: 'statementField' as const,
          statementType: 'incomeStatement' as const,
          fieldKey: 'gross_profit',
          sourceDescription: null,
          value: toProvenanceEntryValue(grossProfits[i]),
        },
        {
          role: `TTM 推銷費用（第 ${i + 1}/4 季，用於營業獲利）`,
          fiscalYear: entryFiscalYear,
          fiscalQuarter: entryFiscalQuarter,
          type: 'statementField' as const,
          statementType: 'incomeStatement' as const,
          fieldKey: 'selling_expense',
          sourceDescription: null,
          value: toProvenanceEntryValue(sellingExpenses[i]),
        },
        {
          role: `TTM 管理費用（第 ${i + 1}/4 季，用於營業獲利）`,
          fiscalYear: entryFiscalYear,
          fiscalQuarter: entryFiscalQuarter,
          type: 'statementField' as const,
          statementType: 'incomeStatement' as const,
          fieldKey: 'administrative_expense',
          sourceDescription: null,
          value: toProvenanceEntryValue(adminExpenses[i]),
        },
        {
          role: `TTM 財務費用（第 ${i + 1}/4 季，用於營業獲利）`,
          fiscalYear: entryFiscalYear,
          fiscalQuarter: entryFiscalQuarter,
          type: 'statementField' as const,
          statementType: 'incomeStatement' as const,
          fieldKey: 'finance_costs',
          sourceDescription: null,
          value: toProvenanceEntryValue(financeCosts[i]),
        },
      ];
    }),
  ];

  return {
    symbol,
    metricCode: 'famaFrenchOperatingProfitability',
    found: true,
    fiscalYear,
    fiscalQuarter: seasonNum,
    value,
    entries,
    methodologyNote: '營業獲利不是財報原始欄位，是毛利-推銷費用-管理費用-財務費用相減得出的中繼值（TTM 加總），見上方原始欄位。分母帳面權益為本季期末快照，不平均不加總。',
  };
};
