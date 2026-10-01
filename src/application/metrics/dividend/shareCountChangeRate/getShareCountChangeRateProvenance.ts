import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import { commonShareEntries } from '../../shared/provenance/shareEntries';
import { resolveShareCountChangeRateInputs, type ShareCountChangeRateDeps } from './computeShareCountChangeRate';

// 2026-09-13 使用者要求擴大稽核鏈——shareCountChangeRate（YoY）= (本季流通在外普通股 - 去年同季流通在外普通股) / 去年同季 * 100。
// 去年同季用 getPastNQuarters({rocYear,season},5)[0] 取得。只有 Q 一種 basis。
//
// 2026-10-01 改成跟 computeShareCountChangeRate 共用 resolveShareCountChangeRateInputs：原本這裡自己重算，去年同季股數沒做面額／
// 配股／減資還原（2881、1235 配股把股數撐大，溯源算成 2.5%、20% 的「增資」，寫入是 0%）。值直接取 resolution.changeRate。

export const getShareCountChangeRateProvenance = async (query: QuarterlyMetricQuery, deps: ShareCountChangeRateDeps): Promise<MetricProvenanceResult> => {
  const r = await resolveShareCountChangeRateInputs(query, deps);

  if (!r) {
    return { symbol: query.symbol, metricCode: 'shareCountChangeRate', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const priorFiscalYear = rocYearToGregorian(Number(r.prior.year));
  const priorSeason = Number(r.prior.season);
  const entries: ProvenanceEntry[] = [
    ...commonShareEntries(r.currentShares, r.fiscalYear, r.seasonNum),
    ...commonShareEntries(r.priorShares, priorFiscalYear, priorSeason, { label: '去年同季報告日' }),
    {
      role: '去年同季到本季的面額／配股／減資還原倍數（去年同季股數 × 這個倍數，換算到本季股數基準）',
      fiscalYear: r.fiscalYear,
      fiscalQuarter: r.seasonNum,
      type: 'other',
      statementType: null,
      fieldKey: null,
      sourceDescription: '公開發行公司股本變動申報（面額變更、股票股利、減資）',
      value: toProvenanceEntryValue(r.splitFactor),
    },
  ];

  return {
    symbol: r.symbol,
    metricCode: 'shareCountChangeRate',
    found: true,
    fiscalYear: r.fiscalYear,
    fiscalQuarter: r.seasonNum,
    value: r.changeRate,
    entries,
    methodologyNote: `去年同季股數先乘上還原倍數（配股、面額變更只是股數變了、不算增資稀釋），還原後＝${r.priorValue ?? 'null'}。`,
  };
};
