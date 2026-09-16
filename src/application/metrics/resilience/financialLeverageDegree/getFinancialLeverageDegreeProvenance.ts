import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveLeverageDegreeProvenanceInputs, growthPct, type QuarterSnapshot } from '../leverageDegreeFamily/resolveLeverageDegreeProvenanceInputs';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-13 使用者要求擴大稽核鏈——financialLeverageDegree(DFL) = EPS 年增率 ÷ EBIT(=營業
// 利益)年增率，本季 vs 去年同季。共用 resolveLeverageDegreeProvenanceInputs。

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
    role: `${label}營業利益（EBIT）`,
    fiscalYear: snapshot.fiscalYear,
    fiscalQuarter: snapshot.fiscalQuarter,
    type: 'statementField',
    statementType: 'incomeStatement',
    fieldKey: 'profit_loss_from_operating_activities',
    sourceDescription: null,
    value: toProvenanceEntryValue(snapshot.operatingIncome),
  },
];

export const getFinancialLeverageDegreeProvenance = async (query: QuarterlyMetricQuery, deps: PitDeps): Promise<MetricProvenanceResult> => {
  const resolution = await resolveLeverageDegreeProvenanceInputs(query, deps);
  if (!resolution) {
    return { symbol: query.symbol, metricCode: 'financialLeverageDegree', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { symbol, fiscalYear, fiscalQuarter, current, prior } = resolution;
  const epsGrowth = growthPct(current.eps, prior.eps);
  const ebitGrowth = growthPct(current.operatingIncome !== null ? Number(current.operatingIncome) : null, prior.operatingIncome !== null ? Number(prior.operatingIncome) : null);
  const value = epsGrowth !== null && ebitGrowth !== null && ebitGrowth !== 0 ? Math.round((epsGrowth / ebitGrowth) * 100) / 100 : null;

  const entries: ProvenanceEntry[] = [...buildQuarterEntries(current, '本季'), ...buildQuarterEntries(prior, '去年同季')];

  return {
    symbol,
    metricCode: 'financialLeverageDegree',
    found: true,
    fiscalYear,
    fiscalQuarter,
    value,
    entries,
    methodologyNote: `DFL = EPS 年增率 ÷ EBIT 年增率。EPS = 淨利×1000÷流通股數（本季/去年同季各自算出後比較），本季 EPS＝${current.eps ?? 'null'}、去年同季 EPS＝${prior.eps ?? 'null'}，EPS 年增率＝${epsGrowth ?? 'null'}%、EBIT 年增率＝${ebitGrowth ?? 'null'}%。`,
  };
};
