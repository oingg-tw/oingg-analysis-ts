import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { toMultipleFromThousands } from '@/domain/metrics/shared/numericHelpers';
import { rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import { resolveTrailingIncomeStatements, trailingPeriodLabel } from '../../shared/trailingYear';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-13 使用者要求擴大稽核鏈——psr(TTM) = 市值(本季知識時點) / 近四季營收加總。跟
// computePsrPit.ts 一致，市值沿用本季（不是 TTM 四季）解析出的知識時點查詢。固定回傳
// TTM（該指標同時有 Q_ANN，這裡跟其餘試點慣例一致優先選 TTM）。

export const getPsrProvenance = async (query: QuarterlyMetricQuery, deps: Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'market' | 'cumulativeStatements'>): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'psr', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const incomeStatement = await deps.statements.getIncomeStatement({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const reportDate = incomeStatement?.reportDate ?? null;
  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);
  const marketCap = mainAnchor ? await deps.market.getMarketCap(symbol, mainAnchor.knowledgeDate) : null;

  // 2026-10-01 近一年改走共用來源，跟 compute 同一份資料（興櫃半年頻，見 shared/trailingYear.ts）。
  const trailing = await resolveTrailingIncomeStatements({ symbol, rocYear, season: season as Season, dataType, subsidiaryCompanyId }, deps);
  const ttmQuarters = trailing.periods;
  const ttmRecords = trailing.periods.map((p) => p.record);
  const revenues = ttmRecords.map((r) => r?.operatingRevenue ?? null);

  let revenueTtmSum = 0n;
  let complete = true;
  for (const revenue of revenues) {
    if (revenue === null) complete = false;
    else revenueTtmSum += revenue;
  }

  const value = complete && marketCap !== null ? toMultipleFromThousands(marketCap.marketCap, revenueTtmSum) : null;

  const entries: ProvenanceEntry[] = [
    {
      role: '市值（本季知識時點：收盤價 × 流通股數）',
      fiscalYear,
      fiscalQuarter: seasonNum,
      type: 'other',
      statementType: null,
      fieldKey: null,
      sourceDescription: marketCap ? `收盤價 ${marketCap.closePrice}（${marketCap.tradeDate}）× 流通股數 ${marketCap.outstandingCommonShares.toString()}` : null,
      value: toProvenanceEntryValue(marketCap?.marketCap ?? null),
    },
    ...ttmQuarters.map(
      (tq, i): ProvenanceEntry => ({
        role: `近一年 營收（${trailingPeriodLabel(tq, trailing.basis)}）`,
        fiscalYear: rocYearToGregorian(Number(tq.year)),
        fiscalQuarter: Number(tq.season),
        type: 'statementField',
        statementType: 'incomeStatement',
        fieldKey: 'revenue',
        sourceDescription: null,
        value: toProvenanceEntryValue(revenues[i]),
      })
    ),
  ];

  return { symbol, metricCode: 'psr', found: true, fiscalYear, fiscalQuarter: seasonNum, value, entries, methodologyNote: null };
};
