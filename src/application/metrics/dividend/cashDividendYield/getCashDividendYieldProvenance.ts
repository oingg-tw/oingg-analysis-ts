import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveShareholderYieldInputs } from '../shareholderYield/computeShareholderYield';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import { cashDividendYieldOf, type CashDividendYieldDeps } from './computeCashDividendYield';

// 2026-10-08 溯源表（「溯源表請務必都加上」）：跟 compute 共用 resolveShareholderYieldInputs／cashDividendYieldOf，值一定等於寫入的值。
// 列近四季股利發放現金 4 筆＋報告日市值；買回那 4 筆不進分子，但「近四季齊全」的判斷看它，所以寫在 methodologyNote。
export const getCashDividendYieldProvenance = async (query: QuarterlyMetricQuery, deps: CashDividendYieldDeps): Promise<MetricProvenanceResult> => {
  const resolution = await resolveShareholderYieldInputs(query, deps);
  if (!resolution) {
    return { symbol: query.symbol, metricCode: 'cashDividendYield', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }
  const { fiscalYear, fiscalQuarter, quarters, marketCap } = resolution;

  const entries: ProvenanceEntry[] = [
    ...quarters.map(
      (q, i): ProvenanceEntry => ({
        role: `近四季 股利發放現金（第 ${i + 1}/4 季，原始資料是現金流出負值，缺漏視為 0）`,
        fiscalYear: q.fiscalYear,
        fiscalQuarter: q.season,
        type: 'statementField',
        statementType: 'cashFlowStatement',
        fieldKey: q.dividendsPaidFieldKey,
        sourceDescription: null,
        value: toProvenanceEntryValue(q.dividendsPaid),
      })
    ),
    {
      role: '本季報告日市值（收盤價 × 流通股數）',
      fiscalYear,
      fiscalQuarter,
      type: 'other',
      statementType: null,
      fieldKey: null,
      sourceDescription: marketCap ? `收盤價 ${marketCap.closePrice}（${marketCap.tradeDate}）× 流通股數 ${marketCap.outstandingCommonShares.toString()}` : null,
      value: toProvenanceEntryValue(marketCap?.marketCap ?? null),
    },
  ];

  return {
    symbol: query.symbol,
    metricCode: 'cashDividendYield',
    found: true,
    fiscalYear,
    fiscalQuarter,
    value: cashDividendYieldOf(resolution).value,
    entries,
    methodologyNote:
      '|近四季股利發放現金加總| × 1000（千元→元）/ 報表日市值 × 100，跟股東總回饋率的股利那一段相同。近四季任一季的現金流量表或買回庫藏股' +
      '（XBRL 長表）整列查無時不計算——跟股東總回饋率同一個判斷，兩支的歷史期數才會一致。',
  };
};
