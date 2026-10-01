import { pickEquityWithFieldKey as pickEquity } from '@/domain/metrics/shared/pickers';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import { commonShareEntries } from '../../shared/provenance/shareEntries';
import { resolveBvpsGrowthRateInputs, type BvpsGrowthRateDeps } from './computeBvpsGrowthRate';

// 2026-09-13 使用者要求擴大稽核鏈——bvpsGrowthRate（單季年增率）= (本季 BVPS - 去年同季 BVPS) / |去年同季 BVPS| * 100，
// 流通股數各自用當下報告日對應的股本。只有 Q 一種 basis。
//
// 2026-10-01 改成跟 computeBvpsGrowthRate 共用 resolveBvpsGrowthRateInputs：原本這裡自己重算，BVPS 四捨五入到分、沒扣特別股清償
// 金額、去年同季也沒做面額／配股還原（上市櫃 20 家有 15 家對不上，2887 55.74% vs 90.73%）。值直接取 resolution.growthRate。

export const getBvpsGrowthRateProvenance = async (query: QuarterlyMetricQuery, deps: BvpsGrowthRateDeps): Promise<MetricProvenanceResult> => {
  const r = await resolveBvpsGrowthRateInputs(query, deps);

  if (!r) {
    return { symbol: query.symbol, metricCode: 'bvpsGrowthRate', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const priorFiscalYear = rocYearToGregorian(Number(r.prior.year));
  const priorSeason = Number(r.prior.season);
  const currentEquity = pickEquity(r.balanceSheet);
  const priorEquity = pickEquity(r.priorBalanceSheet);
  const entries: ProvenanceEntry[] = [
    { role: '本季期末淨值（扣特別股清償金額前）', fiscalYear: r.fiscalYear, fiscalQuarter: r.seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: currentEquity.fieldKey, sourceDescription: null, value: toProvenanceEntryValue(currentEquity.value) },
    ...commonShareEntries(r.currentSharesInfo, r.fiscalYear, r.seasonNum, { preferredClaim: true }),
    { role: '去年同季期末淨值（扣特別股清償金額前）', fiscalYear: priorFiscalYear, fiscalQuarter: priorSeason, type: 'statementField', statementType: 'balanceSheet', fieldKey: priorEquity.fieldKey, sourceDescription: null, value: toProvenanceEntryValue(priorEquity.value) },
    ...commonShareEntries(r.priorSharesInfo, priorFiscalYear, priorSeason, { label: '去年同季報告日', preferredClaim: true }),
    {
      role: '去年同季到本季的面額／配股／減資還原倍數（去年同季 BVPS ÷ 這個倍數，換算到本季股數基準）',
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
    metricCode: 'bvpsGrowthRate',
    found: true,
    fiscalYear: r.fiscalYear,
    fiscalQuarter: r.seasonNum,
    value: r.growthRate,
    entries,
    methodologyNote:
      `BVPS 不是財報原始欄位，是 (淨值 − 特別股清償金額) × 1000（千元換元）÷ 流通在外普通股算出的中繼值（不四捨五入）。` +
      `本季 BVPS＝${r.currentBvps ?? 'null'}，去年同季 BVPS（還原前）＝${r.priorBvps ?? 'null'}。`,
  };
};
