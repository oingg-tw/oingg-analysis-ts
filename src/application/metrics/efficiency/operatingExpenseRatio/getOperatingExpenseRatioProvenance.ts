import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import { trailingPeriodLabel, resolveTrailingIncomeStatements } from '../../shared/trailingYear';
import { toPercent } from '@/domain/metrics/shared/numericHelpers';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-13 使用者要求擴大稽核鏈——operatingExpenseRatio = 近四季(推銷費用+管理費用)加總 /
// 近四季營收加總 × 100。跟 computeOperatingExpenseRatioPit.ts 一致，只用 sellingExpenses+
// adminExpenses，不含研發費用（損益表沒有獨立的研發費用欄位）。現查現算不持久化，
// 刻意不動既有的 compute 檔案。固定回傳 TTM。

export const getOperatingExpenseRatioProvenance = async (query: QuarterlyMetricQuery, deps: Pick<PitDeps, 'statements' | 'quarters' | 'cumulativeStatements'>): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'operatingExpenseRatio', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  // 2026-10-01 近一年改走共用來源，跟 compute 同一份資料（興櫃半年頻，見 shared/trailingYear.ts）。
  const trailing = await resolveTrailingIncomeStatements({ symbol, rocYear, season: season as Season, dataType, subsidiaryCompanyId }, deps);
  const ttmQuarters = trailing.periods;
  const ttmRecords = trailing.periods.map((p) => p.record);

  const revenues = ttmRecords.map((record) => record?.operatingRevenue ?? null);
  const sellingExpenses = ttmRecords.map((record) => record?.sellingExpenses ?? null);
  const adminExpenses = ttmRecords.map((record) => record?.adminExpenses ?? null);

  let revenueTtmSum = 0n;
  let expenseTtmSum = 0n;
  let complete = true;
  for (let i = 0; i < ttmRecords.length; i++) {
    if (revenues[i] === null || sellingExpenses[i] === null || adminExpenses[i] === null) {
      complete = false;
    } else {
      revenueTtmSum += revenues[i]!;
      expenseTtmSum += sellingExpenses[i]! + adminExpenses[i]!;
    }
  }

  const value = complete ? toPercent(expenseTtmSum, revenueTtmSum) : null;

  const entries: ProvenanceEntry[] = ttmQuarters.flatMap((tq, i) => {
    const entryFiscalYear = rocYearToGregorian(Number(tq.year));
    const entryFiscalQuarter = Number(tq.season);
    return [
      {
        role: `近一年 營收（${trailingPeriodLabel(tq, trailing.basis)}）`,
        fiscalYear: entryFiscalYear,
        fiscalQuarter: entryFiscalQuarter,
        type: 'statementField' as const,
        statementType: 'incomeStatement' as const,
        fieldKey: 'revenue',
        sourceDescription: null,
        value: toProvenanceEntryValue(revenues[i]),
      },
      {
        role: `近一年 推銷費用（${trailingPeriodLabel(tq, trailing.basis)}）`,
        fiscalYear: entryFiscalYear,
        fiscalQuarter: entryFiscalQuarter,
        type: 'statementField' as const,
        statementType: 'incomeStatement' as const,
        fieldKey: 'selling_expense',
        sourceDescription: null,
        value: toProvenanceEntryValue(sellingExpenses[i]),
      },
      {
        role: `近一年 管理費用（${trailingPeriodLabel(tq, trailing.basis)}）`,
        fiscalYear: entryFiscalYear,
        fiscalQuarter: entryFiscalQuarter,
        type: 'statementField' as const,
        statementType: 'incomeStatement' as const,
        fieldKey: 'administrative_expense',
        sourceDescription: null,
        value: toProvenanceEntryValue(adminExpenses[i]),
      },
    ];
  });

  return {
    symbol,
    metricCode: 'operatingExpenseRatio',
    found: true,
    fiscalYear,
    fiscalQuarter: seasonNum,
    value,
    entries,
    methodologyNote: '營業費用 = 推銷費用 + 管理費用，不含研發費用（損益表沒有獨立的研發費用欄位，跟 Beneish M-Score 的 SGAI 概念一致，是 SG&A 水準版）。',
  };
};
