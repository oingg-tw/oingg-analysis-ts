import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { pickEquityWithFieldKey as pickEquity } from '@/domain/metrics/shared/pickers';
import { calculateEquityMultiplier } from '@/domain/metrics/resilience/equityMultiplier/calculateEquityMultiplier';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-21 web-nuxt 要求（杜邦頁「計算依據表」）：equityMultiplier 的稽核鏈。只有 Q（資產負債表時點
// 比率）：本季期末總資產 / 本季期末權益（歸屬母公司優先，缺漏退回整體口徑，跟 computeDupontFamily.ts
// 同一支 calculateEquityMultiplier + pickEquity）。
export const getEquityMultiplierProvenance = async (query: QuarterlyMetricQuery, deps: Pick<PitDeps, 'statements' | 'quarters'>): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet'], deps.quarters);
  if (!resolvedQuarter) {
    return { symbol, metricCode: 'equityMultiplier', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const balanceSheet = await deps.statements.getBalanceSheet({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const totalAssets = balanceSheet?.totalAssets ?? null;
  const equity = pickEquity(balanceSheet);
  const value = calculateEquityMultiplier(totalAssets, equity.value).value;

  const entries: ProvenanceEntry[] = [
    { role: '本季期末總資產', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'assets', sourceDescription: null, value: toProvenanceEntryValue(totalAssets) },
    { role: '本季期末權益（歸屬母公司優先）', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: equity.fieldKey, sourceDescription: null, value: toProvenanceEntryValue(equity.value) },
  ];

  return { symbol, metricCode: 'equityMultiplier', found: true, fiscalYear, fiscalQuarter: seasonNum, value, entries, methodologyNote: '總資產 / 權益，四捨五入到小數 4 位；資產負債表時點比率，沒有 TTM。' };
};
