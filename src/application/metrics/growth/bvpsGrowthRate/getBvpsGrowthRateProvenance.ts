import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { calculateYoyGrowthRate } from '@/domain/metrics/shared/numericHelpers';
import { pickEquityWithFieldKey as pickEquity } from '@/domain/metrics/shared/pickers';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-13 使用者要求擴大稽核鏈——bvpsGrowthRate（單季年增率）= (本季 BVPS - 去年同季
// BVPS) / |去年同季 BVPS| * 100，本季/去年同季各自獨立算 BVPS（不依賴 bvps 這個
// metric_code 已寫入的值，跟 computeBvpsGrowthRatePit.ts 一致），流通股數各自用當下
// 報告日對應的股本。只有 Q 一種 basis。

const toBvps = (equityInThousands: bigint | null, shares: bigint | null): number | null => {
  if (equityInThousands === null || shares === null || shares === 0n) return null;
  return Math.round(((Number(equityInThousands) * 1000) / Number(shares)) * 100) / 100;
};

export const getBvpsGrowthRateProvenance = async (query: QuarterlyMetricQuery, deps: Pick<PitDeps, 'statements' | 'quarters' | 'shares'>): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet'], deps.quarters);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'bvpsGrowthRate', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const balanceSheet = await deps.statements.getBalanceSheet({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const currentEquity = pickEquity(balanceSheet);
  const currentReportDate = balanceSheet?.reportDate ?? null;
  const currentShares = currentReportDate ? (await deps.shares.getPaidInShares(symbol, currentReportDate))?.paidInShares ?? null : null;
  const currentBvps = toBvps(currentEquity.value, currentShares);

  const prior = getPastNQuarters({ rocYear, season: season as Season }, 5)[0]!;
  const priorRocYear = Number(prior.year);
  const priorSeason = Number(prior.season);
  const priorBalanceSheet = await deps.statements.getBalanceSheet({ symbol, year: priorRocYear, quarter: priorSeason, dataType, subsidiaryCompanyId });
  const priorEquity = pickEquity(priorBalanceSheet);
  const priorReportDate = priorBalanceSheet?.reportDate ?? null;
  const priorShares = priorReportDate ? (await deps.shares.getPaidInShares(symbol, priorReportDate))?.paidInShares ?? null : null;
  const priorBvps = toBvps(priorEquity.value, priorShares);

  const { value } = calculateYoyGrowthRate(currentBvps, priorBvps);

  const entries: ProvenanceEntry[] = [
    { role: '本季期末淨值', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: currentEquity.fieldKey, sourceDescription: null, value: toProvenanceEntryValue(currentEquity.value) },
    { role: '本季流通股數', fiscalYear, fiscalQuarter: seasonNum, type: 'other', statementType: null, fieldKey: null, sourceDescription: '公開發行公司股本變動申報', value: toProvenanceEntryValue(currentShares) },
    { role: '去年同季期末淨值', fiscalYear: rocYearToGregorian(priorRocYear), fiscalQuarter: priorSeason, type: 'statementField', statementType: 'balanceSheet', fieldKey: priorEquity.fieldKey, sourceDescription: null, value: toProvenanceEntryValue(priorEquity.value) },
    { role: '去年同季流通股數', fiscalYear: rocYearToGregorian(priorRocYear), fiscalQuarter: priorSeason, type: 'other', statementType: null, fieldKey: null, sourceDescription: '公開發行公司股本變動申報', value: toProvenanceEntryValue(priorShares) },
  ];

  return {
    symbol,
    metricCode: 'bvpsGrowthRate',
    found: true,
    fiscalYear,
    fiscalQuarter: seasonNum,
    value,
    entries,
    methodologyNote: `BVPS 不是財報原始欄位，是淨值×1000(千元換元)/流通股數算出的中繼值。本季 BVPS＝${currentBvps ?? 'null'}，去年同季 BVPS＝${priorBvps ?? 'null'}。`,
  };
};
