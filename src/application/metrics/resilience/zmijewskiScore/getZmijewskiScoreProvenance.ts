import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { pickNetIncomeWithFieldKey as pickNetIncome } from '@/domain/metrics/shared/pickers';
import { rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import { resolveTrailingIncomeStatements, trailingPeriodLabel } from '../../shared/trailingYear';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-13 使用者要求擴大稽核鏈——Zmijewski X = -4.3 - 4.5×(淨利TTM/總資產) +
// 5.7×(總負債/總資產) - 0.004×(流動資產/流動負債)。跟 getAltmanZScoreProvenance.ts
// 同一個模式：只算原始分數，不套用金融業排除（那是寫入路徑的政策決定）。固定回傳 TTM。

export const getZmijewskiScoreProvenance = async (query: QuarterlyMetricQuery, deps: Pick<PitDeps, 'statements' | 'quarters' | 'cumulativeStatements'>): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet', 'incomeStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'zmijewskiScore', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const balanceSheet = await deps.statements.getBalanceSheet({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const totalAssets = balanceSheet?.totalAssets ?? null;
  const totalLiabilities = balanceSheet?.totalLiabilities ?? null;
  const currentAssets = balanceSheet?.currentAssets ?? null;
  const currentLiabilities = balanceSheet?.currentLiabilities ?? null;

  // 2026-10-01 近一年改走共用來源，跟 compute 同一份資料（興櫃半年頻，見 shared/trailingYear.ts）。
  const trailing = await resolveTrailingIncomeStatements({ symbol, rocYear, season: season as Season, dataType, subsidiaryCompanyId }, deps);
  const ttmQuarters = trailing.periods;
  const ttmRecords = trailing.periods.map((p) => p.record);
  const netIncomes = ttmRecords.map(pickNetIncome);

  let netIncomeTtmSum = 0n;
  let ttmComplete = true;
  for (const picked of netIncomes) {
    if (picked.value === null) ttmComplete = false;
    else netIncomeTtmSum += picked.value;
  }

  let value: number | null = null;
  if (ttmComplete && totalAssets !== null && totalLiabilities !== null && currentAssets !== null && currentLiabilities !== null && totalAssets !== 0n && currentLiabilities !== 0n) {
    const roa = Number(netIncomeTtmSum) / Number(totalAssets);
    const leverage = Number(totalLiabilities) / Number(totalAssets);
    const currentRatio = Number(currentAssets) / Number(currentLiabilities);
    value = Math.round((-4.3 - 4.5 * roa + 5.7 * leverage - 0.004 * currentRatio) * 10000) / 10000;
  }

  const entries: ProvenanceEntry[] = [
    ...ttmQuarters.map(
      (tq, i): ProvenanceEntry => ({
        role: `近一年 淨利（${trailingPeriodLabel(tq, trailing.basis)}）`,
        fiscalYear: rocYearToGregorian(Number(tq.year)),
        fiscalQuarter: Number(tq.season),
        type: 'statementField',
        statementType: 'incomeStatement',
        fieldKey: netIncomes[i]!.fieldKey,
        sourceDescription: null,
        value: toProvenanceEntryValue(netIncomes[i]!.value),
      })
    ),
    { role: '本季期末總資產', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'assets', sourceDescription: null, value: toProvenanceEntryValue(totalAssets) },
    { role: '本季期末總負債', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'liabilities', sourceDescription: null, value: toProvenanceEntryValue(totalLiabilities) },
    { role: '本季期末流動資產', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'current_assets', sourceDescription: null, value: toProvenanceEntryValue(currentAssets) },
    {
      role: '本季期末流動負債',
      fiscalYear,
      fiscalQuarter: seasonNum,
      type: 'statementField',
      statementType: 'balanceSheet',
      fieldKey: 'current_liabilities',
      sourceDescription: null,
      value: toProvenanceEntryValue(currentLiabilities),
    },
  ];

  return {
    symbol,
    metricCode: 'zmijewskiScore',
    found: true,
    fiscalYear,
    fiscalQuarter: seasonNum,
    value,
    entries,
    methodologyNote: `X = -4.3 - 4.5×ROA + 5.7×槓桿率 - 0.004×流動比率（比率）。ROA = 淨利(TTM)÷總資產、槓桿率 = 總負債÷總資產、流動比率(此處為原始比值不是百分比) = 流動資產÷流動負債。這裡只算原始分數，未套用金融業排除（那是寫入路徑另外決定的政策，見 metric-history 的 nullReason）。`,
  };
};
