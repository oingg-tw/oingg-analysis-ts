import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveShareholderYieldInputs, type ShareholderYieldDeps } from './computeShareholderYield';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-21 web-nuxt 要求：shareholderYield 的稽核鏈。分子是現金流量表近四季的股利發放與買回庫藏股
// 支付現金（各 4 筆），分母是報表日市值（收盤價 × 流通股數，Q 基準，跟 buybackYield 的稽核鏈同一種
// 'other' 寫法），不是即時股價。
export const getShareholderYieldProvenance = async (query: QuarterlyMetricQuery, deps: ShareholderYieldDeps): Promise<MetricProvenanceResult> => {
  const resolution = await resolveShareholderYieldInputs(query, deps);
  if (!resolution) {
    return { symbol: query.symbol, metricCode: 'shareholderYield', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }
  const { fiscalYear, fiscalQuarter, quarters, marketCap, value } = resolution;

  const entries: ProvenanceEntry[] = [
    ...quarters.map(
      (q, i): ProvenanceEntry => ({
        role: `近四季 股利發放現金（第 ${i + 1}/4 季，原始資料是現金流出負值，缺漏視為 0）`,
        fiscalYear: q.fiscalYear,
        fiscalQuarter: q.season,
        type: 'statementField',
        statementType: 'cashFlowStatement',
        fieldKey: 'dividends_paid_financing',
        sourceDescription: null,
        value: toProvenanceEntryValue(q.dividendsPaid),
      })
    ),
    ...quarters.map(
      (q, i): ProvenanceEntry => ({
        role: `近四季 買回庫藏股支付現金（第 ${i + 1}/4 季，原始資料是現金流出負值）`,
        fiscalYear: q.fiscalYear,
        fiscalQuarter: q.season,
        type: 'statementField',
        statementType: 'cashFlowStatement',
        fieldKey: 'payments_to_acquire_treasury_shares',
        sourceDescription: null,
        value: toProvenanceEntryValue(q.treasuryShares),
      })
    ),
    {
      role: '本季報告日市值（收盤價 × 流通股數）',
      fiscalYear,
      fiscalQuarter,
      type: 'other',
      statementType: null,
      fieldKey: null,
      sourceDescription: marketCap ? `收盤價 ${marketCap.closePrice}（${marketCap.tradeDate}）× 流通股數 ${marketCap.paidInShares.toString()}` : null,
      value: toProvenanceEntryValue(marketCap?.marketCap ?? null),
    },
  ];

  return {
    symbol: query.symbol,
    metricCode: 'shareholderYield',
    found: true,
    fiscalYear,
    fiscalQuarter,
    value,
    entries,
    methodologyNote: '(|近四季股利發放現金加總| + |近四季買回庫藏股支付現金加總|) × 1000（千元→元）/ 報表日市值 × 100。買回庫藏股整列查無資料（XBRL 長表未回填）視為近四季不齊，不計算。',
  };
};
