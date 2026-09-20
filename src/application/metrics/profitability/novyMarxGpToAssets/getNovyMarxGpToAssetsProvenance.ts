import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import { toPercent } from '@/domain/metrics/shared/numericHelpers';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-13 使用者要求擴大稽核鏈——novyMarxGpToAssets(TTM) = 近四季毛利加總 / 本季期末
// 總資產（分母不平均不加總，跟 accrualsRatio/ROE/ROA 同一種慣例）。固定回傳 TTM。

export const getNovyMarxGpToAssetsProvenance = async (query: QuarterlyMetricQuery, deps: Pick<PitDeps, 'statements' | 'quarters'>): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet', 'incomeStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'novyMarxGpToAssets', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const balanceSheet = await deps.statements.getBalanceSheet({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const totalAssets = balanceSheet?.totalAssets ?? null;

  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => deps.statements.getIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );
  const grossProfits = ttmRecords.map((record) => record?.grossProfit ?? null);

  let grossProfitTtmSum = 0n;
  let complete = true;
  for (const gp of grossProfits) {
    if (gp === null) complete = false;
    else grossProfitTtmSum += gp;
  }

  const value = complete && totalAssets !== null ? toPercent(grossProfitTtmSum, totalAssets) : null;

  const entries: ProvenanceEntry[] = [
    ...ttmQuarters.map(
      (tq, i): ProvenanceEntry => ({
        role: `近四季 毛利（第 ${i + 1}/4 季）`,
        fiscalYear: rocYearToGregorian(Number(tq.year)),
        fiscalQuarter: Number(tq.season),
        type: 'statementField',
        statementType: 'incomeStatement',
        fieldKey: 'gross_profit',
        sourceDescription: null,
        value: toProvenanceEntryValue(grossProfits[i]),
      })
    ),
    { role: '本季期末總資產', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'assets', sourceDescription: null, value: toProvenanceEntryValue(totalAssets) },
  ];

  return { symbol, metricCode: 'novyMarxGpToAssets', found: true, fiscalYear, fiscalQuarter: seasonNum, value, entries, methodologyNote: null };
};
