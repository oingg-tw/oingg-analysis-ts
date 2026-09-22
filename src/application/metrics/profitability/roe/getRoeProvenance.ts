import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveRoeQuarterData, type RoeDeps } from './computeRoe';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-10 web-nuxt 要求：GET /companies/:symbol/metric-provenance 的 roe 試點，
// 現查現算不持久化，見 getPiotroskiFScoreBreakdown.ts 同一天稍早的先例。目前固定回傳
// TTM basis 的溯源（跟 roe-history 端點的預設 basis 一致），Q/Q_ANN 的欄位組成比較簡單，
// 之後真的需要再開放 periodType 查詢參數。2026-09-11：舊三大表已退役，不再需要處理
// 「命中舊表 fallback，fieldKey 對不上會計模式端點」的降級分支——resolver 回傳的
// fieldKey 永遠是 XBRL 的 snake_case key，缺資料時直接是 null（missing_input 情境），
// 不是「有資料但來源不同」。


// 2026-09-17 Phase 3：跟 computeRoe 共用同一份 resolver，所以也收同一組 deps（provenanceResolvers.ts 綁定）。
export const getRoeProvenance = async (query: QuarterlyMetricQuery, deps: RoeDeps): Promise<MetricProvenanceResult> => {
  const resolution = await resolveRoeQuarterData(query, deps);

  if (!resolution) {
    return { symbol: query.symbol, metricCode: 'roe', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { symbol, fiscalYear, fiscalQuarter, balances, roeTtmPct, ttmQuarters, ttmNetIncomes } = resolution;

  const buildStatementFieldEntry = (
    role: string,
    picked: { value: bigint | null; fieldKey: string | null },
    statementType: 'balanceSheet' | 'incomeStatement',
    entryFiscalYear: number,
    entryFiscalQuarter: number
  ): ProvenanceEntry => ({
    role,
    fiscalYear: entryFiscalYear,
    fiscalQuarter: entryFiscalQuarter,
    type: 'statementField',
    statementType,
    fieldKey: picked.fieldKey,
    sourceDescription: null,
    value: toProvenanceEntryValue(picked.value),
  });

  const entries: ProvenanceEntry[] = [
    ...ttmQuarters.map((tq, i) =>
      buildStatementFieldEntry(`近四季 淨利（第 ${i + 1}/4 季）`, ttmNetIncomes[i]!, 'incomeStatement', rocYearToGregorian(Number(tq.year)), Number(tq.season))
    ),
    // 2026-09-22 起分母是 5 個季末權益的平均（見 shared/averageBalances.ts），逐季列出讓讀者能自己算平均。
    ...balances.quarters.map((bq, i) => buildStatementFieldEntry(`季末權益（平均分母第 ${i + 1}/5 點）`, balances.equities[i]!, 'balanceSheet', bq.fiscalYear, bq.fiscalQuarter)),
  ];

  return {
    symbol,
    metricCode: 'roe',
    found: true,
    fiscalYear,
    fiscalQuarter,
    value: roeTtmPct,
    entries,
    methodologyNote: 'ROE（TTM）= 近四季淨利加總 ÷ 近四季窗口 5 個季末權益的平均（t−4 … t）；Q = 本季淨利 ÷ 本季與上季期末權益平均。2026-09-22 前分母是本季單一期末值。',
  };
};
