import { pickNetIncomeWithFieldKey as pickNetIncome } from '@/domain/metrics/shared/pickers';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import { trailingPeriodLabel } from '../../shared/trailingYear';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import { commonShareEntries } from '../../shared/provenance/shareEntries';
import { PEG_GROWTH_YEARS, resolvePegRatioInputs, type AnnualEps, type PegRatioDeps } from './computePegRatio';

// 2026-09-13 使用者要求擴大稽核鏈——pegRatio(TTM) = PER(TTM) / EPS 5年複合成長率(%)。EPS CAGR 固定只取 5 年（PEG 原始
// 概念本身沒有其他年期）。成長率非正時 PEG 無意義回傳 null。固定回傳 TTM。
//
// 2026-10-01 改成跟 computePegRatio 共用 resolvePegRatioInputs：原本這裡自己重算，中繼 EPS/PER/CAGR 各自四捨五入、沒扣特別股
// 股利、年度 EPS 也沒做面額／配股還原（v2~v5 都沒跟上）。值直接取 resolution.pegRatio；年度 EPS 列出股數組成、特別股股利與
// 還原倍數。

const netIncomeEntries = (label: string, trailing: AnnualEps['trailing']): ProvenanceEntry[] =>
  trailing.periods.map((p): ProvenanceEntry => {
    const netIncome = pickNetIncome(p.record);
    return {
      role: `${label}${trailingPeriodLabel(p, trailing.basis)}淨利`,
      fiscalYear: rocYearToGregorian(Number(p.year)),
      fiscalQuarter: Number(p.season),
      type: 'statementField',
      statementType: 'incomeStatement',
      fieldKey: netIncome.fieldKey,
      sourceDescription: null,
      value: toProvenanceEntryValue(netIncome.value),
    };
  });

const annualEntries = (label: string, rocYear: number, annual: AnnualEps): ProvenanceEntry[] => {
  const fiscalYear = rocYearToGregorian(rocYear);
  return [
    ...netIncomeEntries(label, annual.trailing),
    ...commonShareEntries(annual.shares, fiscalYear, 4, { label: `${label}Q4 報告日`, preferredDividends: 'TTM' }),
    {
      role: `${label}面額／配股／減資還原倍數（年度 EPS ÷ 這個倍數，換算到最新股數基準）`,
      fiscalYear,
      fiscalQuarter: 4,
      type: 'other',
      statementType: null,
      fieldKey: null,
      sourceDescription: '公開發行公司股本變動申報（面額變更、股票股利、減資）',
      value: toProvenanceEntryValue(annual.splitFactor),
    },
  ];
};

export const getPegRatioProvenance = async (query: QuarterlyMetricQuery, deps: PegRatioDeps): Promise<MetricProvenanceResult> => {
  const r = await resolvePegRatioInputs(query, deps);

  if (!r) {
    return { symbol: query.symbol, metricCode: 'pegRatio', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const currentLabel = `最近完整會計年度（民國 ${r.latestCompleteFiscalYear} 年，用於 5 年 EPS CAGR）`;
  const priorLabel = `5 年前完整會計年度（民國 ${r.latestCompleteFiscalYear - PEG_GROWTH_YEARS} 年，用於 5 年 EPS CAGR）`;

  const entries: ProvenanceEntry[] = [
    {
      role: '股價（本季知識時點，用於 PER）',
      fiscalYear: r.fiscalYear,
      fiscalQuarter: r.seasonNum,
      type: 'other',
      statementType: null,
      fieldKey: null,
      sourceDescription: r.stockPrice ? `證交所／櫃買中心每日收盤價（實際交易日 ${r.stockPrice.tradeDate}）` : null,
      value: toProvenanceEntryValue(r.stockPrice?.closePrice ?? null),
    },
    ...commonShareEntries(r.shares, r.fiscalYear, r.seasonNum, { label: '本季報告日（PER 用）', preferredDividends: 'TTM' }),
    ...netIncomeEntries('近一年（PER 用 EPS 分子）', r.trailing),
    ...annualEntries(currentLabel, r.latestCompleteFiscalYear, r.currentAnnual),
    ...annualEntries(priorLabel, r.latestCompleteFiscalYear - PEG_GROWTH_YEARS, r.priorAnnual),
  ];

  return {
    symbol: r.symbol,
    metricCode: 'pegRatio',
    found: true,
    fiscalYear: r.fiscalYear,
    fiscalQuarter: r.seasonNum,
    value: r.pegRatio,
    entries,
    methodologyNote:
      `PER(TTM)＝${r.peRatioTtm ?? 'null'}（EPS(TTM)＝${r.epsTtm ?? 'null'}），EPS 5年複合成長率＝${r.epsCagr5yPct ?? 'null'}%` +
      `（最近完整會計年度 EPS＝${r.currentAnnual.eps ?? 'null'}，5 年前＝${r.priorAnnual.eps ?? 'null'}，皆已扣特別股股利並還原到最新股數基準）。` +
      '皆為計算出的中繼值、不四捨五入，只在 PEG 四捨五入一次。',
  };
};
