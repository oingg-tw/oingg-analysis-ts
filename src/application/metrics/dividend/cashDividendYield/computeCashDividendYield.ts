import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { type ComputationBatch, noQuarterBatch, periodSlot } from '@/domain/metrics/computation';
import { resolveShareholderYieldInputs, type ShareholderYieldDeps } from '../shareholderYield/computeShareholderYield';

// 現金股利殖利率（近四季）＝股東總回饋率的股利那一段（見 cashDividendYieldDefinition）。資料、近四季齊全判斷、市值、knowledge date
// 全部跟 computeShareholderYield 同一套（同一支 resolveShareholderYieldInputs），值的差別只在分子少了買回。
export type CashDividendYieldDeps = ShareholderYieldDeps;

export const cashDividendYieldOf = (resolution: { ttmComplete: boolean; dividendsAbs: bigint; marketCap: { marketCap: number } | null }): { value: number | null; nullReason: MetricNullReason | null } => {
  const { ttmComplete, dividendsAbs, marketCap } = resolution;
  // 千元 × 1000 = 元，跟 shareholderYield／buybackYield 同一種換算。
  const value = ttmComplete && marketCap && marketCap.marketCap > 0 ? Math.round(((Number(dividendsAbs) * 1000) / marketCap.marketCap) * 100 * 100) / 100 : null;
  return { value, nullReason: value !== null ? null : !ttmComplete ? 'insufficient_history' : 'missing_input' };
};

export const computeCashDividendYield = async (query: QuarterlyMetricQuery, deps: CashDividendYieldDeps): Promise<ComputationBatch<'ttm'>> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;
  const resolution = await resolveShareholderYieldInputs(query, deps);
  if (!resolution) return noQuarterBatch(symbol, ['ttm']);

  const { year, season, fiscalYear, fiscalQuarter, reportDate } = resolution;
  const anchor = await resolveKnowledgeDate(symbol, [{ rocYear: Number(year), season: fiscalQuarter, reportDate }], deps.announcements);
  const { value, nullReason } = cashDividendYieldOf(resolution);
  const ttm = periodSlot(anchor, { symbol, metricCode: 'cashDividendYield', fiscalYear, fiscalQuarter, dataType, subsidiaryCompanyId }, 'TTM', value, nullReason);
  return { symbol, rocYear: year, season, slots: { ttm } };
};
