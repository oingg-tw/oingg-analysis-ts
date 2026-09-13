import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveBeneishMScoreInputs } from '../beneishMScore/computeBeneishMScorePit';
import { rocYearToGregorian } from '@/shared/rocQuarter';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-13 使用者要求擴大稽核鏈——beneishDsri = 本期(應收帳款/營收) / 去年同期
// (應收帳款/營收)。是 beneishMScore 8 個變量之一，曝露成獨立 metric_code，共用同一個
// resolveBeneishMScoreInputs（跟 computeBeneishDsriPit.ts 一致）。跟 beneishMScore
// 稽核鏈同樣的先例：不套用金融保險業排除，永遠顯示原始公式結果。

export const getBeneishDsriProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const resolution = await resolveBeneishMScoreInputs(query);

  if (!resolution) {
    return { symbol: query.symbol, metricCode: 'beneishDsri', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { symbol, fiscalYear, fiscalQuarter, curr, prev, priorRocYear, priorSeason, dsri } = resolution;
  const priorFiscalYear = rocYearToGregorian(priorRocYear);
  const value = dsri !== null ? Math.round(dsri * 10000) / 10000 : null;

  const buildEntries = (label: string, entryFiscalYear: number, entryFiscalQuarter: number, data: typeof curr): ProvenanceEntry[] => [
    { role: `${label}應收帳款淨額`, fiscalYear: entryFiscalYear, fiscalQuarter: entryFiscalQuarter, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'accounts_receivable_net', sourceDescription: null, value: toProvenanceEntryValue(data.accountsReceivable) },
    { role: `${label}營收`, fiscalYear: entryFiscalYear, fiscalQuarter: entryFiscalQuarter, type: 'statementField', statementType: 'incomeStatement', fieldKey: 'revenue', sourceDescription: null, value: toProvenanceEntryValue(data.operatingRevenue) },
  ];

  const entries: ProvenanceEntry[] = [
    ...buildEntries('本季', fiscalYear, fiscalQuarter, curr),
    ...buildEntries('去年同季', priorFiscalYear, priorSeason, prev),
  ];

  return {
    symbol,
    metricCode: 'beneishDsri',
    found: true,
    fiscalYear,
    fiscalQuarter,
    value,
    entries,
    methodologyNote: 'DSRI = 本季(應收帳款/營收) / 去年同季(應收帳款/營收)，是計算出的中繼值。此模型不適用金融保險業，但這裡刻意不套用排除，永遠顯示原始公式結果。',
  };
};
