import { resolveQuarterOrLatest } from '@/models/latestQuarter';
import { getBalanceSheetXbrlFirst as getQuarterlyBalanceSheet } from '@/models/balanceSheetXbrlFirst';
import { getPaidInSharesAsOf } from '@/models/capitalStock';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-13 使用者要求擴大稽核鏈——shareCountChangeRate（YoY）= (本季流通股數 - 去年
// 同季流通股數) / 去年同季流通股數 * 100。去年同季用 getPastNQuarters({rocYear,season},
// 5)[0] 取得。跟 computeShareCountChangeRatePit.ts 一致。只有 Q 一種 basis。

export const getShareCountChangeRateProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet']);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'shareCountChangeRate', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const balanceSheet = await getQuarterlyBalanceSheet({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const reportDate = balanceSheet?.reportDate ?? null;
  const currentShares = reportDate ? (await getPaidInSharesAsOf(symbol, reportDate))?.paidInShares ?? null : null;

  const prior = getPastNQuarters({ rocYear, season: season as Season }, 5)[0]!;
  const priorRocYear = Number(prior.year);
  const priorSeason = Number(prior.season);
  const priorBalanceSheet = await getQuarterlyBalanceSheet({ symbol, year: priorRocYear, quarter: priorSeason, dataType, subsidiaryCompanyId });
  const priorReportDate = priorBalanceSheet?.reportDate ?? null;
  const priorShares = priorReportDate ? (await getPaidInSharesAsOf(symbol, priorReportDate))?.paidInShares ?? null : null;

  const value =
    currentShares !== null && priorShares !== null && priorShares !== 0n
      ? Math.round((Number(currentShares - priorShares) / Number(priorShares)) * 100 * 100) / 100
      : null;

  const entries: ProvenanceEntry[] = [
    { role: '本季流通股數', fiscalYear, fiscalQuarter: seasonNum, type: 'other', statementType: null, fieldKey: null, sourceDescription: '公開發行公司股本變動申報', value: toProvenanceEntryValue(currentShares) },
    { role: '去年同季流通股數', fiscalYear: rocYearToGregorian(priorRocYear), fiscalQuarter: priorSeason, type: 'other', statementType: null, fieldKey: null, sourceDescription: '公開發行公司股本變動申報', value: toProvenanceEntryValue(priorShares) },
  ];

  return { symbol, metricCode: 'shareCountChangeRate', found: true, fiscalYear, fiscalQuarter: seasonNum, value, entries, methodologyNote: null };
};
