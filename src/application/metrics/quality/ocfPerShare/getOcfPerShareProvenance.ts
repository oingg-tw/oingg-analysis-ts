import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import { resolveCashFlowReportDate, resolveTrailingCashFlowStatements, trailingPeriodLabel } from '@/application/metrics/shared/trailingYear';
import { toPerShare } from '@/domain/metrics/shared/numericHelpers';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-13 使用者要求擴大稽核鏈——ocfPerShare(TTM) = 近四季營業活動現金流加總×1000
// (千元換元) / 流通股數（本季報告日）。跟 computeCashFlowPerSharePit.ts 一致，股數用
// reportDate 不是 knowledgeDate（跟該檔案一致，不涉及股價，沒有 resolveKnowledgeDate
// 的必要）。固定回傳 TTM（該指標同時有 Q/Q_ANN，這裡跟其餘試點慣例一致優先選 TTM）。

export const getOcfPerShareProvenance = async (query: QuarterlyMetricQuery, deps: Pick<PitDeps, 'statements' | 'quarters' | 'shares' | 'cumulativeStatements'>): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['cashFlowStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'ocfPerShare', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const cashFlowStatement = await deps.statements.getCashFlowStatement({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  // 2026-10-01 股數日期跟 compute 一樣走 resolveCashFlowReportDate（興櫃沒有單季現金流，見 shared/trailingYear.ts）。
  const reportDate = cashFlowStatement?.reportDate ?? (await resolveCashFlowReportDate({ symbol, rocYear, season: season as Season, dataType, subsidiaryCompanyId }, deps));
  const shares = reportDate ? (await deps.shares.getOutstandingCommonShares(symbol, reportDate))?.outstandingCommonShares ?? null : null;

  // 2026-10-01 近一年改走共用來源，跟 compute 同一份資料（興櫃半年頻，見 shared/trailingYear.ts）。
  const trailing = await resolveTrailingCashFlowStatements({ symbol, rocYear, season: season as Season, dataType, subsidiaryCompanyId }, deps);
  const ttmQuarters = trailing.periods;
  const ttmRecords = trailing.periods.map((p) => p.record);
  const ocfs = ttmRecords.map((r) => r?.netCashFromOperatingActivities ?? null);

  let ocfTtmSum = 0n;
  let complete = true;
  for (const ocf of ocfs) {
    if (ocf === null) complete = false;
    else ocfTtmSum += ocf;
  }

  const value = complete && shares !== null ? toPerShare(ocfTtmSum, shares) : null;

  const entries: ProvenanceEntry[] = [
    { role: '本季流通股數', fiscalYear, fiscalQuarter: seasonNum, type: 'other', statementType: null, fieldKey: null, sourceDescription: '公開發行公司股本變動申報', value: toProvenanceEntryValue(shares) },
    ...ttmQuarters.map(
      (tq, i): ProvenanceEntry => ({
        role: `近一年 營業活動現金流（${trailingPeriodLabel(tq, trailing.basis)}）`,
        fiscalYear: rocYearToGregorian(Number(tq.year)),
        fiscalQuarter: Number(tq.season),
        type: 'statementField',
        statementType: 'cashFlowStatement',
        fieldKey: 'cash_flows_from_used_in_operating_activities',
        sourceDescription: null,
        value: toProvenanceEntryValue(ocfs[i]),
      })
    ),
  ];

  return { symbol, metricCode: 'ocfPerShare', found: true, fiscalYear, fiscalQuarter: seasonNum, value, entries, methodologyNote: null };
};
