import { pickEquityWithFieldKey as pickEquity, pickNetIncomeWithFieldKey as pickNetIncome } from '@/domain/metrics/shared/pickers';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import { trailingPeriodLabel } from '../../shared/trailingYear';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import { commonShareEntries } from '../../shared/provenance/shareEntries';
import { resolveGrahamNumberInputs, type GrahamNumberDeps } from './computeGrahamNumber';

// 2026-09-13 使用者要求擴大稽核鏈——grahamNumber(TTM) = PER(TTM) × PBR，數學上等價於原始公式 sqrt(22.5×EPS×BVPS) vs 股價
// 的比較（見 computeGrahamNumber.ts 2026-09-10 的說明）。固定回傳 TTM。
//
// 2026-10-01 改成跟 computeGrahamNumber 共用 resolveGrahamNumberInputs：原本這裡自己重算，中繼 EPS/BVPS/PER/PBR 各自四捨五入
// （v2 已改成只在最後四捨五入一次）、分子也沒扣特別股股利／特別股清償金額（v3/v4），上市櫃 20 家全部對不上。值直接取
// resolution.grahamNumber。

export const getGrahamNumberProvenance = async (query: QuarterlyMetricQuery, deps: GrahamNumberDeps): Promise<MetricProvenanceResult> => {
  const r = await resolveGrahamNumberInputs(query, deps);

  if (!r) {
    return { symbol: query.symbol, metricCode: 'grahamNumber', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const equity = pickEquity(r.balanceSheet);
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
    ...commonShareEntries(r.shares, r.fiscalYear, r.seasonNum, { preferredDividends: 'TTM', preferredClaim: true }),
    { role: '本季期末淨值（BVPS 分子，扣特別股清償金額前）', fiscalYear: r.fiscalYear, fiscalQuarter: r.seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: equity.fieldKey, sourceDescription: null, value: toProvenanceEntryValue(equity.value) },
    ...r.trailing.periods.map((tq): ProvenanceEntry => {
      const netIncome = pickNetIncome(tq.record);
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
    metricCode: 'grahamNumber',
    found: true,
    fiscalYear: r.fiscalYear,
    fiscalQuarter: r.seasonNum,
    value: r.grahamNumber,
    entries,
    methodologyNote:
      `grahamNumber = PER(TTM) × PBR，中間值都不四捨五入、只在最後四捨五入一次：` +
      `BVPS＝(淨值 − 特別股清償金額) ÷ 流通在外普通股＝${r.bvps ?? 'null'}、PBR＝${r.pbRatio ?? 'null'}、` +
      `EPS(TTM)＝(近一年淨利 − 近四季特別股股利) ÷ 流通在外普通股＝${r.epsTtm ?? 'null'}、PER(TTM)＝${r.peRatioTtm ?? 'null'}。`,
  };
};
