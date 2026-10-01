import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import type { MetricProvenanceResult } from '../../shared/provenance/provenanceTypes';
import { resolveLeverageDegreeInputs, type LeverageDegreeFamilyDeps } from '../leverageDegreeFamily/computeLeverageDegreeFamily';
import { leverageDegreeEntries } from '../leverageDegreeFamily/leverageDegreeProvenanceEntries';

// 2026-09-13 使用者要求擴大稽核鏈——totalLeverageDegree(DTL) = EPS 年增率 ÷ 營收年增率，本季 vs 去年同季。跟
// getFinancialLeverageDegreeProvenance.ts 的差異只在分母換成營收，不是 EBIT。
//
// 2026-10-01 改成跟 computeLeverageDegreeFamily 共用 resolveLeverageDegreeInputs：原本的 resolveLeverageDegreeProvenanceInputs 自己重算，
// 去年同季 EPS 沒做面額／配股還原（v3/v4），1235 溯源 −2.78 vs 寫入 −4.75。值直接取 resolution.dtl。

export const getTotalLeverageDegreeProvenance = async (query: QuarterlyMetricQuery, deps: LeverageDegreeFamilyDeps): Promise<MetricProvenanceResult> => {
  const r = await resolveLeverageDegreeInputs(query, deps);
  if (!r) {
    return { symbol: query.symbol, metricCode: 'totalLeverageDegree', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  return {
    symbol: r.symbol,
    metricCode: 'totalLeverageDegree',
    found: true,
    fiscalYear: r.fiscalYear,
    fiscalQuarter: r.seasonNum,
    value: r.dtl,
    entries: leverageDegreeEntries(r, 'operatingRevenue'),
    methodologyNote: `DTL = EPS 年增率 ÷ 營收年增率。EPS = 淨利×1000÷流通在外普通股（本季/去年同季各自算出，去年同季再除以還原倍數），本季 EPS＝${r.currentEps ?? 'null'}、去年同季 EPS（還原後）＝${r.priorEps ?? 'null'}，EPS 年增率＝${r.epsGrowth ?? 'null'}%、營收年增率＝${r.revenueGrowth ?? 'null'}%。`,
  };
};
