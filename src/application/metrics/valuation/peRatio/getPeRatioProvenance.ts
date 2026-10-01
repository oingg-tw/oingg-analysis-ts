import { pickNetIncomeWithFieldKey as pickNetIncome } from '@/domain/metrics/shared/pickers';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import { trailingPeriodLabel } from '../../shared/trailingYear';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import { commonShareEntries } from '../../shared/provenance/shareEntries';
import { resolvePeRatioInputs, type PeRatioDeps } from './computePeRatio';

// 2026-09-13 使用者要求擴大稽核鏈——peRatio(TTM) = 股價(本季知識時點) / EPS(TTM)。股價用本季（不是 TTM 四季）解析出的
// 知識時點查詢，跟寫入路徑一致。固定回傳 TTM。
//
// 2026-10-01 改成跟 computePeRatio 共用 resolvePeRatioInputs：原本這裡自己重算 EPS，還是四捨五入的 toPerShare（v2 已改
// toPerShareExact）、也沒扣特別股股利（v3），小 EPS 公司（1101 −18.88 vs −19.72）與金控（2881）都對不上。值直接取
// resolution.peRatioTtm；股數列拆成流通在外普通股的組成與特別股股利。

export const getPeRatioProvenance = async (query: QuarterlyMetricQuery, deps: PeRatioDeps): Promise<MetricProvenanceResult> => {
  const r = await resolvePeRatioInputs(query, deps);

  if (!r) {
    return { symbol: query.symbol, metricCode: 'peRatio', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
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
    metricCode: 'peRatio',
    found: true,
    fiscalYear: r.fiscalYear,
    fiscalQuarter: r.seasonNum,
    value: r.peRatioTtm,
    entries,
    methodologyNote: `EPS(TTM) 不是財報原始欄位，是 (近一年淨利加總 − 近四季特別股股利) × 1000（千元換元）÷ 流通在外普通股算出的中繼值（不四捨五入，只在本益比四捨五入一次）。EPS(TTM)＝${r.epsTtm ?? 'null'}。`,
  };
};
