import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import type { MetricProvenanceResult } from '../../shared/provenance/provenanceTypes';
import { resolveLeverageDegreeInputs, type LeverageDegreeFamilyDeps } from '../leverageDegreeFamily/computeLeverageDegreeFamily';
import { leverageDegreeEntries } from '../leverageDegreeFamily/leverageDegreeProvenanceEntries';

// 2026-09-13 使用者要求擴大稽核鏈——financialLeverageDegree(DFL) = EPS 年增率 ÷ EBIT(=營業利益)年增率，本季 vs 去年同季。
//
// 2026-10-01 改成跟 computeLeverageDegreeFamily 共用 resolveLeverageDegreeInputs：原本的 resolveLeverageDegreeProvenanceInputs 自己重算，
// 去年同季 EPS 沒做面額／配股還原（v3/v4），1235 溯源 −0.12 vs 寫入 −0.21。值直接取 resolution.dfl。

export const getFinancialLeverageDegreeProvenance = async (query: QuarterlyMetricQuery, deps: LeverageDegreeFamilyDeps): Promise<MetricProvenanceResult> => {
  const r = await resolveLeverageDegreeInputs(query, deps);
  if (!r) {
    return { symbol: query.symbol, metricCode: 'financialLeverageDegree', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  return {
    symbol: r.symbol,
    metricCode: 'financialLeverageDegree',
    found: true,
    fiscalYear: r.fiscalYear,
    fiscalQuarter: r.seasonNum,
    value: r.dfl,
    entries: leverageDegreeEntries(r, 'operatingIncome'),
    methodologyNote: `DFL = EPS 年增率 ÷ EBIT 年增率。EPS = 淨利×1000÷流通在外普通股（本季/去年同季各自算出，去年同季再除以還原倍數），本季 EPS＝${r.currentEps ?? 'null'}、去年同季 EPS（還原後）＝${r.priorEps ?? 'null'}，EPS 年增率＝${r.epsGrowth ?? 'null'}%、EBIT 年增率＝${r.ebitGrowth ?? 'null'}%。`,
  };
};
