import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveLeverageDegreeProvenanceInputs, growthPct, type QuarterSnapshot } from '../leverageDegreeFamily/resolveLeverageDegreeProvenanceInputs';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-13 使用者要求擴大稽核鏈——totalLeverageDegree(DTL) = EPS 年增率 ÷ 營收年增率，
// 本季 vs 去年同季。共用 resolveLeverageDegreeProvenanceInputs，跟
// getFinancialLeverageDegreeProvenance.ts 的差異只在分母換成營收，不是 EBIT。

const buildQuarterEntries = (snapshot: QuarterSnapshot, label: string): ProvenanceEntry[] => [
  {
    role: `${label}淨利`,
    fiscalYear: snapshot.fiscalYear,
    fiscalQuarter: snapshot.fiscalQuarter,
    type: 'statementField',
    statementType: 'incomeStatement',
    fieldKey: snapshot.netIncome.fieldKey,
    sourceDescription: null,
    value: toProvenanceEntryValue(snapshot.netIncome.value),
  },
  {
    role: `${label}流通股數`,
    fiscalYear: snapshot.fiscalYear,
    fiscalQuarter: snapshot.fiscalQuarter,
    type: 'other',
    statementType: null,
    fieldKey: null,
    sourceDescription: '公開發行公司股本變動申報',
    value: toProvenanceEntryValue(snapshot.shares),
  },
  {
    role: `${label}營收`,
    fiscalYear: snapshot.fiscalYear,
    fiscalQuarter: snapshot.fiscalQuarter,
    type: 'statementField',
    statementType: 'incomeStatement',
    fieldKey: 'revenue',
    sourceDescription: null,
    value: toProvenanceEntryValue(snapshot.operatingRevenue),
  },
];

export const getTotalLeverageDegreeProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const resolution = await resolveLeverageDegreeProvenanceInputs(query);
  if (!resolution) {
    return { symbol: query.symbol, metricCode: 'totalLeverageDegree', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { symbol, fiscalYear, fiscalQuarter, current, prior } = resolution;
  const epsGrowth = growthPct(current.eps, prior.eps);
  const revenueGrowth = growthPct(current.operatingRevenue !== null ? Number(current.operatingRevenue) : null, prior.operatingRevenue !== null ? Number(prior.operatingRevenue) : null);
  const value = epsGrowth !== null && revenueGrowth !== null && revenueGrowth !== 0 ? Math.round((epsGrowth / revenueGrowth) * 100) / 100 : null;

  const entries: ProvenanceEntry[] = [...buildQuarterEntries(current, '本季'), ...buildQuarterEntries(prior, '去年同季')];

  return {
    symbol,
    metricCode: 'totalLeverageDegree',
    found: true,
    fiscalYear,
    fiscalQuarter,
    value,
    entries,
    methodologyNote: `DTL = EPS 年增率 ÷ 營收年增率。EPS = 淨利×1000÷流通股數（本季/去年同季各自算出後比較），本季 EPS＝${current.eps ?? 'null'}、去年同季 EPS＝${prior.eps ?? 'null'}，EPS 年增率＝${epsGrowth ?? 'null'}%、營收年增率＝${revenueGrowth ?? 'null'}%。`,
  };
};
