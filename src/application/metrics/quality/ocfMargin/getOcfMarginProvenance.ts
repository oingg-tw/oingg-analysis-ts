import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import { resolveTrailingCashFlowStatements, resolveTrailingIncomeStatements, trailingPeriodLabel } from '@/application/metrics/shared/trailingYear';
import { toPercent } from '@/domain/metrics/shared/numericHelpers';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-13 使用者要求擴大稽核鏈——ocfMargin(TTM) = 近四季營業活動現金流加總 / 近四季
// 營收加總。跟 computeCashFlowValuationFamilyPit.ts 一致，這裡只重新查這支自己真正的
// 依賴，不是那個 family 共用的 ttmComplete 旗標。純財報比率，不涉及股價/市值，沒有
// resolveKnowledgeDate 的必要（跟 evToOcf 等系列指標不同）。只有 TTM 一種 basis。

export const getOcfMarginProvenance = async (query: QuarterlyMetricQuery, deps: Pick<PitDeps, 'statements' | 'quarters' | 'cumulativeStatements'>): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement', 'cashFlowStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'ocfMargin', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  // 2026-10-01 近一年改走共用來源，跟 compute 同一份資料（興櫃半年頻，見 shared/trailingYear.ts）；兩張表的 periods 順序相同、逐段配對。
  const trailingKey = { symbol, rocYear, season: season as Season, dataType, subsidiaryCompanyId };
  const [trailingIncome, trailingCashFlow] = await Promise.all([resolveTrailingIncomeStatements(trailingKey, deps), resolveTrailingCashFlowStatements(trailingKey, deps)]);
  const ttmQuarters = trailingIncome.periods;
  const ttmRecords = trailingIncome.periods.map((p, i) => [p.record, trailingCashFlow.periods[i]?.record ?? null] as const);
  const revenues = ttmRecords.map(([r]) => r?.operatingRevenue ?? null);
  const ocfs = ttmRecords.map(([, r]) => r?.netCashFromOperatingActivities ?? null);

  let revenueTtmSum = 0n;
  let ocfTtmSum = 0n;
  let complete = true;
  for (let i = 0; i < ttmRecords.length; i++) {
    if (revenues[i] === null || ocfs[i] === null) complete = false;
    else {
      revenueTtmSum += revenues[i]!;
      ocfTtmSum += ocfs[i]!;
    }
  }

  const value = complete ? toPercent(ocfTtmSum, revenueTtmSum) : null;

  const entries: ProvenanceEntry[] = ttmQuarters.flatMap((tq, i): ProvenanceEntry[] => {
    const entryFiscalYear = rocYearToGregorian(Number(tq.year));
    const entryFiscalQuarter = Number(tq.season);
    return [
      {
        role: `近一年 營收（${trailingPeriodLabel(tq, trailingIncome.basis)}）`,
        fiscalYear: entryFiscalYear,
        fiscalQuarter: entryFiscalQuarter,
        type: 'statementField',
        statementType: 'incomeStatement',
        fieldKey: 'revenue',
        sourceDescription: null,
        value: toProvenanceEntryValue(revenues[i]),
      },
      {
        role: `近一年 營業活動現金流（${trailingPeriodLabel(tq, trailingIncome.basis)}）`,
        fiscalYear: entryFiscalYear,
        fiscalQuarter: entryFiscalQuarter,
        type: 'statementField',
        statementType: 'cashFlowStatement',
        fieldKey: 'cash_flows_from_used_in_operating_activities',
        sourceDescription: null,
        value: toProvenanceEntryValue(ocfs[i]),
      },
    ];
  });

  return { symbol, metricCode: 'ocfMargin', found: true, fiscalYear, fiscalQuarter: seasonNum, value, entries, methodologyNote: null };
};
