import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { pickEquityWithFieldKey as pickEquity } from '@/domain/metrics/shared/pickers';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-13 使用者要求擴大稽核鏈——Z″ = 6.56*X1+3.26*X2+6.72*X3+1.05*X4，
// X1=(流動資產-流動負債)/總資產、X2=保留盈餘/總資產、X3=EBIT(TTM)/總資產、
// X4=帳面權益(歸屬母公司優先，缺漏退回整體口徑)/總負債。跟 getAltmanZScoreProvenance.ts
// 同一個模式：只算原始分數，不套用製造業/金融業排除（那是寫入路徑的政策決定，不是
// 這支公式本身的計算，見 computeAltmanZDoublePrimeScorePit.ts 的排除邏輯）。固定回傳 TTM。

export const getAltmanZDoublePrimeScoreProvenance = async (query: QuarterlyMetricQuery, deps: Pick<PitDeps, 'statements' | 'quarters'>): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet', 'incomeStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'altmanZDoublePrimeScore', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const balanceSheet = await deps.statements.getBalanceSheet({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const currentAssets = balanceSheet?.currentAssets ?? null;
  const currentLiabilities = balanceSheet?.currentLiabilities ?? null;
  const totalAssets = balanceSheet?.totalAssets ?? null;
  const totalLiabilities = balanceSheet?.totalLiabilities ?? null;
  const retainedEarnings = balanceSheet?.retainedEarnings ?? null;
  const bookEquity = pickEquity(balanceSheet);

  const x1 = currentAssets !== null && currentLiabilities !== null && totalAssets !== null && totalAssets !== 0n ? Math.round((Number(currentAssets - currentLiabilities) / Number(totalAssets)) * 10000) / 10000 : null;
  const x2 = retainedEarnings !== null && totalAssets !== null && totalAssets !== 0n ? Math.round((Number(retainedEarnings) / Number(totalAssets)) * 10000) / 10000 : null;
  const x4 = bookEquity.value !== null && totalLiabilities !== null && totalLiabilities !== 0n ? Math.round((Number(bookEquity.value) / Number(totalLiabilities)) * 10000) / 10000 : null;

  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => deps.statements.getIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );
  const preTaxes = ttmRecords.map((record) => record?.profitBeforeTax ?? null);
  const financeCosts = ttmRecords.map((record) => record?.financeCosts ?? null);

  let ebitTtmSum = 0n;
  let ttmComplete = true;
  for (let i = 0; i < ttmRecords.length; i++) {
    if (preTaxes[i] === null || financeCosts[i] === null) {
      ttmComplete = false;
    } else {
      ebitTtmSum += preTaxes[i]! + financeCosts[i]!;
    }
  }
  const x3 = ttmComplete && totalAssets !== null && totalAssets !== 0n ? Math.round((Number(ebitTtmSum) / Number(totalAssets)) * 10000) / 10000 : null;

  const value = x1 !== null && x2 !== null && x3 !== null && x4 !== null ? Math.round((6.56 * x1 + 3.26 * x2 + 6.72 * x3 + 1.05 * x4) * 100) / 100 : null;

  const entries: ProvenanceEntry[] = [
    { role: '本季期末流動資產（X1 分子的一部分）', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'current_assets', sourceDescription: null, value: toProvenanceEntryValue(currentAssets) },
    {
      role: '本季期末流動負債（X1 分子的一部分）',
      fiscalYear,
      fiscalQuarter: seasonNum,
      type: 'statementField',
      statementType: 'balanceSheet',
      fieldKey: 'current_liabilities',
      sourceDescription: null,
      value: toProvenanceEntryValue(currentLiabilities),
    },
    {
      role: '本季期末保留盈餘（X2 分子）',
      fiscalYear,
      fiscalQuarter: seasonNum,
      type: 'statementField',
      statementType: 'balanceSheet',
      fieldKey: 'retained_earnings',
      sourceDescription: null,
      value: toProvenanceEntryValue(retainedEarnings),
    },
    { role: '本季期末總資產（X1/X2/X3 共同分母）', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'assets', sourceDescription: null, value: toProvenanceEntryValue(totalAssets) },
    {
      role: '本季期末帳面權益（X4 分子）',
      fiscalYear,
      fiscalQuarter: seasonNum,
      type: 'statementField',
      statementType: 'balanceSheet',
      fieldKey: bookEquity.fieldKey,
      sourceDescription: null,
      value: toProvenanceEntryValue(bookEquity.value),
    },
    {
      role: '本季期末總負債（X4 分母）',
      fiscalYear,
      fiscalQuarter: seasonNum,
      type: 'statementField',
      statementType: 'balanceSheet',
      fieldKey: 'liabilities',
      sourceDescription: null,
      value: toProvenanceEntryValue(totalLiabilities),
    },
    ...ttmQuarters.flatMap((tq, i): ProvenanceEntry[] => {
      const entryFiscalYear = rocYearToGregorian(Number(tq.year));
      const entryFiscalQuarter = Number(tq.season);
      return [
        {
          role: `近四季 稅前淨利（第 ${i + 1}/4 季，用於 X3 的 EBIT）`,
          fiscalYear: entryFiscalYear,
          fiscalQuarter: entryFiscalQuarter,
          type: 'statementField',
          statementType: 'incomeStatement',
          fieldKey: 'profit_loss_before_tax',
          sourceDescription: null,
          value: toProvenanceEntryValue(preTaxes[i]),
        },
        {
          role: `近四季 財務費用（第 ${i + 1}/4 季，用於 X3 的 EBIT）`,
          fiscalYear: entryFiscalYear,
          fiscalQuarter: entryFiscalQuarter,
          type: 'statementField',
          statementType: 'incomeStatement',
          fieldKey: 'finance_costs',
          sourceDescription: null,
          value: toProvenanceEntryValue(financeCosts[i]),
        },
      ];
    }),
  ];

  return {
    symbol,
    metricCode: 'altmanZDoublePrimeScore',
    found: true,
    fiscalYear,
    fiscalQuarter: seasonNum,
    value,
    entries,
    methodologyNote: `Z″ = 6.56×X1 + 3.26×X2 + 6.72×X3 + 1.05×X4。X1＝${x1 ?? 'null'}、X2＝${x2 ?? 'null'}、X3(EBIT/總資產，EBIT=TTM 稅前淨利+財務費用加總)＝${x3 ?? 'null'}、X4＝${x4 ?? 'null'}。這裡只算原始分數，未套用製造業/金融業排除（那是寫入路徑另外決定的政策，見 metric-history 的 nullReason）。`,
  };
};
