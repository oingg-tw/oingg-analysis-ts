import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import { resolveCashFlowReportDate, resolveTrailingCashFlowStatements, trailingPeriodLabel } from '@/application/metrics/shared/trailingYear';
import { toPerShare } from '@/domain/metrics/shared/numericHelpers';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-15 應 web-nuxt「營收到股利去了哪裡」瀑布圖卡片需求新增——
// depreciationAmortisationPerShare(TTM) = 近四季（折舊費用+攤銷費用）加總×1000（千元換元）
// / 流通股數（本季報告日）。跟 computeCashFlowPerSharePit.ts / getOcfPerShareProvenance.ts
// 一致，股數用 reportDate 不是 knowledgeDate（不涉及股價，沒有 resolveKnowledgeDate 的
// 必要）。固定回傳 TTM（跟其餘試點慣例一致）。

export const getDepreciationAmortisationPerShareProvenance = async (query: QuarterlyMetricQuery, deps: Pick<PitDeps, 'statements' | 'quarters' | 'shares' | 'cumulativeStatements'>): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['cashFlowStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'depreciationAmortisationPerShare', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
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
  const depreciations = ttmRecords.map((r) => r?.depreciation ?? null);
  const amortizations = ttmRecords.map((r) => r?.amortization ?? null);

  let daSumTtm = 0n;
  let complete = true;
  for (let i = 0; i < ttmRecords.length; i++) {
    const d = depreciations[i]!;
    const a = amortizations[i]!;
    if (d === null || a === null) complete = false;
    else daSumTtm += d + a;
  }

  const value = complete && shares !== null ? toPerShare(daSumTtm, shares) : null;

  const entries: ProvenanceEntry[] = [
    { role: '本季流通股數', fiscalYear, fiscalQuarter: seasonNum, type: 'other', statementType: null, fieldKey: null, sourceDescription: '公開發行公司股本變動申報', value: toProvenanceEntryValue(shares) },
    ...ttmQuarters.flatMap(
      (tq, i): ProvenanceEntry[] => [
        {
          role: `近一年 折舊費用（${trailingPeriodLabel(tq, trailing.basis)}）`,
          fiscalYear: rocYearToGregorian(Number(tq.year)),
          fiscalQuarter: Number(tq.season),
          type: 'statementField',
          statementType: 'cashFlowStatement',
          fieldKey: 'adj_depreciation_expense',
          sourceDescription: null,
          value: toProvenanceEntryValue(depreciations[i] ?? null),
        },
        {
          role: `近一年 攤銷費用（${trailingPeriodLabel(tq, trailing.basis)}）`,
          fiscalYear: rocYearToGregorian(Number(tq.year)),
          fiscalQuarter: Number(tq.season),
          type: 'statementField',
          statementType: 'cashFlowStatement',
          fieldKey: 'adj_amortisation_expense',
          sourceDescription: null,
          value: toProvenanceEntryValue(amortizations[i] ?? null),
        },
      ]
    ),
  ];

  return { symbol, metricCode: 'depreciationAmortisationPerShare', found: true, fiscalYear, fiscalQuarter: seasonNum, value, entries, methodologyNote: null };
};
