import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import { toPercent } from '@/domain/metrics/shared/numericHelpers';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-10-09 流動／非流動負債占總資產比的溯源表（兩支共用，結構同 getDebtRatioProvenance.ts）：負債科目 ÷ 期末總資產 × 100。
const PARTS = {
  currentLiabilitiesToAssets: { role: '本季期末流動負債', fieldKey: 'current_liabilities', pick: 'currentLiabilities' },
  nonCurrentLiabilitiesToAssets: { role: '本季期末非流動負債', fieldKey: 'noncurrent_liabilities', pick: 'noncurrentLiabilities' },
} as const;

export const getLiabilityCompositionProvenance =
  (metricCode: keyof typeof PARTS, deps: Pick<PitDeps, 'statements' | 'quarters'>) =>
  async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
    const { symbol, dataType, subsidiaryCompanyId } = query;
    const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet'], deps.quarters);
    if (!resolvedQuarter) {
      return { symbol, metricCode, found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
    }

    const rocYear = Number(resolvedQuarter.year);
    const seasonNum = Number(resolvedQuarter.season);
    const fiscalYear = rocYearToGregorian(rocYear);
    const part = PARTS[metricCode];

    const balanceSheet = await deps.statements.getBalanceSheet({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
    const liabilities = balanceSheet?.[part.pick] ?? null;
    const totalAssets = balanceSheet?.totalAssets ?? null;
    const value = liabilities !== null && totalAssets !== null ? toPercent(liabilities, totalAssets) : null;

    const entries: ProvenanceEntry[] = [
      { role: part.role, fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: part.fieldKey, sourceDescription: null, value: toProvenanceEntryValue(liabilities) },
      { role: '本季期末總資產', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'assets', sourceDescription: null, value: toProvenanceEntryValue(totalAssets) },
    ];

    return { symbol, metricCode, found: true, fiscalYear, fiscalQuarter: seasonNum, value, entries, methodologyNote: null };
  };
