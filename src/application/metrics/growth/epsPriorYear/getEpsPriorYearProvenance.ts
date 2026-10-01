import { pickNetIncomeWithFieldKey as pickNetIncome } from '@/domain/metrics/shared/pickers';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import { commonShareEntries } from '../../shared/provenance/shareEntries';
import type { EpsGrowthRateDeps } from '../epsGrowthRate/computeEpsGrowthRate';
import { resolveEpsPriorYear } from './computeEpsPriorYear';

// 跟 computeEpsPriorYear 共用 resolveEpsPriorYear，值一定等於寫入的值（2026-10-01「溯源表請務必都加上」）。
export const getEpsPriorYearProvenance = async (query: QuarterlyMetricQuery, deps: EpsGrowthRateDeps): Promise<MetricProvenanceResult> => {
  const r = await resolveEpsPriorYear(query, deps);
  if (!r) {
    return { symbol: query.symbol, metricCode: 'epsPriorYear', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const priorFiscalYear = rocYearToGregorian(Number(r.prior.year));
  const priorSeason = Number(r.prior.season);
  const priorNetIncome = pickNetIncome(r.priorIncomeStatement);
  const entries: ProvenanceEntry[] = [
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
    metricCode: 'epsPriorYear',
    found: true,
    fiscalYear: r.fiscalYear,
    fiscalQuarter: r.seasonNum,
    value: r.value,
    entries,
    methodologyNote:
      `去年同季 EPS（還原前）＝ (去年同季淨利 − 近四季特別股股利 ÷ 4) × 1000（千元換元）÷ 去年同季報告日的流通在外普通股＝${r.priorEps ?? 'null'}；` +
      `再除以還原倍數換算到本季股數基準，四捨五入到分。這個數字也是每股盈餘成長年增率的分母（年增率那邊取絕對值、不四捨五入）。`,
  };
};
