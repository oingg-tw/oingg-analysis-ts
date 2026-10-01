import { pickNetIncomeWithFieldKey as pickNetIncome } from '@/domain/metrics/shared/pickers';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import { commonShareEntries } from '../../shared/provenance/shareEntries';
import { resolveEpsGrowthRateInputs, type EpsGrowthRateDeps } from './computeEpsGrowthRate';

// 2026-09-13 使用者要求擴大稽核鏈——epsGrowthRate（單季年增率）= (本季 EPS - 去年同季 EPS) / |去年同季 EPS| * 100，
// 流通股數各自用當下報告日對應的股本。只有 Q 一種 basis。
//
// 2026-10-01 改成跟 computeEpsGrowthRate 共用 resolveEpsGrowthRateInputs：原本這裡自己重算，EPS 四捨五入到分、沒扣特別股股利、
// 去年同季也沒做面額／配股還原（v2~v5 都沒跟上，上市櫃 20 家有 19 家對不上）。值直接取 resolution.growthRate。

export const getEpsGrowthRateProvenance = async (query: QuarterlyMetricQuery, deps: EpsGrowthRateDeps): Promise<MetricProvenanceResult> => {
  const r = await resolveEpsGrowthRateInputs(query, deps);

  if (!r) {
    return { symbol: query.symbol, metricCode: 'epsGrowthRate', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const priorFiscalYear = rocYearToGregorian(Number(r.prior.year));
  const priorSeason = Number(r.prior.season);
  const currentNetIncome = pickNetIncome(r.incomeStatement);
  const priorNetIncome = pickNetIncome(r.priorIncomeStatement);
  const entries: ProvenanceEntry[] = [
    { role: '本季淨利', fiscalYear: r.fiscalYear, fiscalQuarter: r.seasonNum, type: 'statementField', statementType: 'incomeStatement', fieldKey: currentNetIncome.fieldKey, sourceDescription: null, value: toProvenanceEntryValue(currentNetIncome.value) },
    ...commonShareEntries(r.currentSharesInfo, r.fiscalYear, r.seasonNum, { preferredDividends: 'Q' }),
    { role: '去年同季淨利', fiscalYear: priorFiscalYear, fiscalQuarter: priorSeason, type: 'statementField', statementType: 'incomeStatement', fieldKey: priorNetIncome.fieldKey, sourceDescription: null, value: toProvenanceEntryValue(priorNetIncome.value) },
    ...commonShareEntries(r.priorSharesInfo, priorFiscalYear, priorSeason, { label: '去年同季報告日', preferredDividends: 'Q' }),
    {
      role: '去年同季到本季的面額／配股／減資還原倍數（去年同季 EPS ÷ 這個倍數，換算到本季股數基準）',
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
    metricCode: 'epsGrowthRate',
    found: true,
    fiscalYear: r.fiscalYear,
    fiscalQuarter: r.seasonNum,
    value: r.growthRate,
    entries,
    methodologyNote:
      `EPS 不是財報原始欄位，是 (單季淨利 − 近四季特別股股利 ÷ 4) × 1000（千元換元）÷ 流通在外普通股算出的中繼值（不四捨五入）。` +
      `本季 EPS＝${r.currentEps ?? 'null'}，去年同季 EPS（還原前）＝${r.priorEps ?? 'null'}。`,
  };
};
