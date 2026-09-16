import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { calculateYoyGrowthRate } from '@/domain/metrics/shared/numericHelpers';
import { pickNetIncomeWithFieldKey as pickNetIncome } from '@/domain/metrics/shared/pickers';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-13 使用者要求擴大稽核鏈——epsGrowthRate（單季年增率）= (本季 EPS - 去年同季
// EPS) / |去年同季 EPS| * 100，本季/去年同季各自獨立算 EPS（不依賴 eps 這個 metric_code
// 已寫入的值，跟 computeEpsGrowthRatePit.ts 一致），流通股數各自用當下報告日對應的股本。
// 只有 Q 一種 basis。

const toEps = (netIncomeInThousands: bigint | null, shares: bigint | null): number | null => {
  if (netIncomeInThousands === null || shares === null || shares === 0n) return null;
  return Math.round(((Number(netIncomeInThousands) * 1000) / Number(shares)) * 100) / 100;
};

export const getEpsGrowthRateProvenance = async (query: QuarterlyMetricQuery, deps: Pick<PitDeps, 'statements' | 'quarters' | 'shares'>): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'epsGrowthRate', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const incomeStatement = await deps.statements.getIncomeStatement({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const currentNetIncome = pickNetIncome(incomeStatement);
  const currentReportDate = incomeStatement?.reportDate ?? null;
  const currentShares = currentReportDate ? (await deps.shares.getPaidInShares(symbol, currentReportDate))?.paidInShares ?? null : null;
  const currentEps = toEps(currentNetIncome.value, currentShares);

  const prior = getPastNQuarters({ rocYear, season: season as Season }, 5)[0]!;
  const priorRocYear = Number(prior.year);
  const priorSeason = Number(prior.season);
  const priorIncomeStatement = await deps.statements.getIncomeStatement({ symbol, year: priorRocYear, quarter: priorSeason, dataType, subsidiaryCompanyId });
  const priorNetIncome = pickNetIncome(priorIncomeStatement);
  const priorReportDate = priorIncomeStatement?.reportDate ?? null;
  const priorShares = priorReportDate ? (await deps.shares.getPaidInShares(symbol, priorReportDate))?.paidInShares ?? null : null;
  const priorEps = toEps(priorNetIncome.value, priorShares);

  const { value } = calculateYoyGrowthRate(currentEps, priorEps);

  const entries: ProvenanceEntry[] = [
    { role: '本季淨利', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'incomeStatement', fieldKey: currentNetIncome.fieldKey, sourceDescription: null, value: toProvenanceEntryValue(currentNetIncome.value) },
    { role: '本季流通股數', fiscalYear, fiscalQuarter: seasonNum, type: 'other', statementType: null, fieldKey: null, sourceDescription: '公開發行公司股本變動申報', value: toProvenanceEntryValue(currentShares) },
    { role: '去年同季淨利', fiscalYear: rocYearToGregorian(priorRocYear), fiscalQuarter: priorSeason, type: 'statementField', statementType: 'incomeStatement', fieldKey: priorNetIncome.fieldKey, sourceDescription: null, value: toProvenanceEntryValue(priorNetIncome.value) },
    { role: '去年同季流通股數', fiscalYear: rocYearToGregorian(priorRocYear), fiscalQuarter: priorSeason, type: 'other', statementType: null, fieldKey: null, sourceDescription: '公開發行公司股本變動申報', value: toProvenanceEntryValue(priorShares) },
  ];

  return {
    symbol,
    metricCode: 'epsGrowthRate',
    found: true,
    fiscalYear,
    fiscalQuarter: seasonNum,
    value,
    entries,
    methodologyNote: `EPS 不是財報原始欄位，是淨利×1000(千元換元)/流通股數算出的中繼值。本季 EPS＝${currentEps ?? 'null'}，去年同季 EPS＝${priorEps ?? 'null'}。`,
  };
};
