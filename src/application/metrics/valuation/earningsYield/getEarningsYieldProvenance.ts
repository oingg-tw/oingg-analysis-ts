import { pickNetIncomeWithFieldKey as pickNetIncome } from '@/domain/metrics/shared/pickers';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import { trailingPeriodLabel } from '../../shared/trailingYear';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import { commonShareEntries } from '../../shared/provenance/shareEntries';
import { resolveEarningsYieldInputs, type EarningsYieldDeps } from './computeEarningsYield';

// 2026-09-13 使用者要求擴大稽核鏈——earningsYield(TTM) = EPS(TTM) / 股價(本季知識時點) × 100，是本益比倒數換算成百分比呈現。
// 固定回傳 TTM。
//
// 2026-10-01 改成跟 computeEarningsYield 共用 resolveEarningsYieldInputs：原本這裡自己重算 EPS，還是四捨五入的 toPerShare、
// 也沒扣特別股股利，跟寫入的值對不上（2881 9.31 vs 9.09）。值直接取 resolution.earningsYieldTtm。

export const getEarningsYieldProvenance = async (query: QuarterlyMetricQuery, deps: EarningsYieldDeps): Promise<MetricProvenanceResult> => {
  const r = await resolveEarningsYieldInputs(query, deps);

  if (!r) {
    return { symbol: query.symbol, metricCode: 'earningsYield', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const entries: ProvenanceEntry[] = [
    {
      role: '股價（本季知識時點）',
      fiscalYear: r.fiscalYear,
      fiscalQuarter: r.seasonNum,
      type: 'other',
      statementType: null,
      fieldKey: null,
      sourceDescription: r.stockPrice ? `證交所／櫃買中心每日收盤價（實際交易日 ${r.stockPrice.tradeDate}）` : null,
      value: toProvenanceEntryValue(r.stockPrice?.closePrice ?? null),
    },
    ...commonShareEntries(r.shares, r.fiscalYear, r.seasonNum, { preferredDividends: 'TTM' }),
    ...r.ttmQuarters.map((tq, i): ProvenanceEntry => {
      const netIncome = pickNetIncome(r.ttmRecords[i] ?? null);
      return {
        role: `近一年 淨利（${trailingPeriodLabel(tq, r.trailing.basis)}，EPS 分子）`,
        fiscalYear: rocYearToGregorian(Number(tq.year)),
        fiscalQuarter: Number(tq.season),
        type: 'statementField',
        statementType: 'incomeStatement',
        fieldKey: netIncome.fieldKey,
        sourceDescription: null,
        value: toProvenanceEntryValue(netIncome.value),
      };
    }),
  ];

  return {
    symbol: r.symbol,
    metricCode: 'earningsYield',
    found: true,
    fiscalYear: r.fiscalYear,
    fiscalQuarter: r.seasonNum,
    value: r.earningsYieldTtm,
    entries,
    methodologyNote: `EPS(TTM) 不是財報原始欄位，是 (近一年淨利加總 − 近四季特別股股利) × 1000（千元換元）÷ 流通在外普通股算出的中繼值（不四捨五入）。EPS(TTM)＝${r.epsTtm ?? 'null'}。`,
  };
};
