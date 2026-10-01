import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import { trailingPeriodLabel } from '../../shared/trailingYear';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import { commonShareEntries } from '../../shared/provenance/shareEntries';
import { resolveFcfYieldInputs, type FcfYieldDeps } from './computeFcfYield';

// 2026-09-13 使用者要求擴大稽核鏈——fcfYield(TTM) = 每股 FCF(TTM，近四季 FCF 加總×1000(千元換元)/流通在外普通股) / 股價
// (本季知識時點) × 100。固定回傳 TTM（該指標同時有 Q_ANN，這裡跟其餘試點慣例一致優先選 TTM）。
//
// 2026-10-01 改成跟 computeFcfYield 共用 resolveFcfYieldInputs：原本這裡自己重算，中繼每股 FCF 還是四捨五入的 toPerShare
// （v2 已改 toPerShareExact），1101 1.64 vs 1.62 這類小數第二位對不上。值直接取 resolution.fcfYieldTtmPct。

export const getFcfYieldProvenance = async (query: QuarterlyMetricQuery, deps: FcfYieldDeps): Promise<MetricProvenanceResult> => {
  const r = await resolveFcfYieldInputs(query, deps);

  if (!r) {
    return { symbol: query.symbol, metricCode: 'fcfYield', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
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
    ...commonShareEntries(r.shares, r.fiscalYear, r.seasonNum),
    ...r.ttmQuarters.flatMap((tq, i): ProvenanceEntry[] => {
      const record = r.ttmRecords[i] ?? null;
      const at = { fiscalYear: rocYearToGregorian(Number(tq.year)), fiscalQuarter: Number(tq.season), sourceDescription: null };
      return [
        { role: `近一年 營業活動現金流（${trailingPeriodLabel(tq, r.trailing.basis)}，用於 FCF）`, ...at, type: 'statementField', statementType: 'cashFlowStatement', fieldKey: 'cash_flows_from_used_in_operating_activities', value: toProvenanceEntryValue(record?.netCashFromOperatingActivities) },
        { role: `近一年 資本支出（${trailingPeriodLabel(tq, r.trailing.basis)}，用於 FCF，原始資料是負值）`, ...at, type: 'statementField', statementType: 'cashFlowStatement', fieldKey: 'purchase_of_ppe_investing', value: toProvenanceEntryValue(record?.capitalExpenditures) },
      ];
    }),
  ];

  return {
    symbol: r.symbol,
    metricCode: 'fcfYield',
    found: true,
    fiscalYear: r.fiscalYear,
    fiscalQuarter: r.seasonNum,
    value: r.fcfYieldTtmPct,
    entries,
    methodologyNote: `每股 FCF(TTM) 不是財報原始欄位，是近一年 FCF(=OCF+資本支出)加總×1000(千元換元)÷流通在外普通股算出的中繼值（不四捨五入）。每股 FCF(TTM)＝${r.fcfPerShareTtm ?? 'null'}。`,
  };
};
