import { rocYearToGregorian } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveRoeQuarterData } from './computeRoePit';
import type { MetricProvenanceResult, ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-10 web-nuxt 要求：GET /companies/:symbol/metric-provenance 的 roe 試點，
// 現查現算不持久化，見 getPiotroskiFScoreBreakdown.ts 同一天稍早的先例。目前固定回傳
// TTM basis 的溯源（跟 roe-history 端點的預設 basis 一致），Q/Q_ANN 的欄位組成比較簡單，
// 之後真的需要再開放 periodType 查詢參數。2026-09-11：舊三大表已退役，不再需要處理
// 「命中舊表 fallback，fieldKey 對不上會計模式端點」的降級分支——resolver 回傳的
// fieldKey 永遠是 XBRL 的 snake_case key，缺資料時直接是 null（missing_input 情境），
// 不是「有資料但來源不同」。

const toEntryValue = (value: bigint | null): string | number | null => (value === null ? null : value.toString());

export const getRoeProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const resolution = await resolveRoeQuarterData(query);

  if (!resolution) {
    return { symbol: query.symbol, metricCode: 'roe', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { symbol, fiscalYear, fiscalQuarter, equity, roeTtmPct, ttmQuarters, ttmNetIncomes } = resolution;

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
    value: toEntryValue(picked.value),
  });

  const entries: ProvenanceEntry[] = [
    ...ttmQuarters.map((tq, i) =>
      buildStatementFieldEntry(`TTM 淨利（第 ${i + 1}/4 季）`, ttmNetIncomes[i]!, 'incomeStatement', rocYearToGregorian(Number(tq.year)), Number(tq.season))
    ),
    buildStatementFieldEntry('本季期末權益（TTM 分母不取平均，固定用本季單一期末值）', equity, 'balanceSheet', fiscalYear, fiscalQuarter),
  ];

  return {
    symbol,
    metricCode: 'roe',
    found: true,
    fiscalYear,
    fiscalQuarter,
    value: roeTtmPct,
    entries,
    methodologyNote: null,
  };
};
