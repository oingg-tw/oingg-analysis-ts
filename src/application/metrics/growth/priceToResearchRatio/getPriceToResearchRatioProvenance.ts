import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import { trailingPeriodLabel } from '@/application/metrics/shared/trailingYear';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import { resolvePriceToResearchRatioInputs, type PriceToResearchRatioDeps } from './computePriceToResearchRatio';

// 2026-10-01 使用者要求「溯源表請務必都加上」——priceToResearchRatio(TTM) = 市值 ÷ 近四季研發費用加總。
// 值直接讀 compute 的 resolvePriceToResearchRatioInputs，不在這裡重算。研發費用走 xbrlAccounts（只有 XBRL 寬表有），
// 這支還沒接 shared/trailingYear 的興櫃半年頻，所以期間一律是四季（標籤用 'quarters'），興櫃公司會是缺值，跟寫入的值一致。

export const getPriceToResearchRatioProvenance = async (query: QuarterlyMetricQuery, deps: PriceToResearchRatioDeps): Promise<MetricProvenanceResult> => {
  const r = await resolvePriceToResearchRatioInputs(query, deps);
  if (!r) {
    return { symbol: query.symbol, metricCode: 'priceToResearchRatio', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const entries: ProvenanceEntry[] = [
    {
      role: '市值（本季知識時點：收盤價 × 流通股數）',
      fiscalYear: r.fiscalYear,
      fiscalQuarter: r.fiscalQuarter,
      type: 'other',
      statementType: null,
      fieldKey: null,
      sourceDescription: r.marketCap ? `收盤價 ${r.marketCap.closePrice}（${r.marketCap.tradeDate}）× 流通股數 ${r.marketCap.outstandingCommonShares.toString()}` : null,
      value: toProvenanceEntryValue(r.marketCap?.marketCap ?? null),
    },
    ...r.ttmQuarters.map(
      (tq, i): ProvenanceEntry => ({
        role: `近四季 研發費用（${trailingPeriodLabel(tq, 'quarters')}）`,
        fiscalYear: rocYearToGregorian(Number(tq.year)),
        fiscalQuarter: Number(tq.season),
        type: 'statementField',
        statementType: 'incomeStatement',
        fieldKey: 'research_and_development_expense',
        sourceDescription: null,
        value: toProvenanceEntryValue(r.rdRecords[i]),
      })
    ),
  ];

  return { symbol: query.symbol, metricCode: 'priceToResearchRatio', found: true, fiscalYear: r.fiscalYear, fiscalQuarter: r.fiscalQuarter, value: r.ttmValue, entries, methodologyNote: null };
};
