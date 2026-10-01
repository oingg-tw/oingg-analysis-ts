import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { pickNetIncomeWithFieldKey as pickNetIncome } from '@/domain/metrics/shared/pickers';
import { rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import { resolveTrailingCashFlowStatements, resolveTrailingIncomeStatements, trailingPeriodLabel } from '@/application/metrics/shared/trailingYear';
import { toRatio } from '@/domain/metrics/shared/numericHelpers';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-13 使用者要求擴大稽核鏈——ocfToNetIncome(TTM) = 近四季營業活動現金流加總 /
// 近四季淨利加總（單位「倍」不是百分比）。跟 computeOcfToNetIncomePit.ts 一致，沒有
// Q_ANN（flow/flow 比率年化沒有意義）。固定回傳 TTM（該指標同時有 Q，這裡跟其餘試點
// 慣例一致優先選 TTM）。

export const getOcfToNetIncomeProvenance = async (query: QuarterlyMetricQuery, deps: Pick<PitDeps, 'statements' | 'quarters' | 'cumulativeStatements'>): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement', 'cashFlowStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'ocfToNetIncome', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
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
  const netIncomes = ttmRecords.map(([r]) => pickNetIncome(r));
  const ocfs = ttmRecords.map(([, r]) => r?.netCashFromOperatingActivities ?? null);

  let netIncomeTtmSum = 0n;
  let ocfTtmSum = 0n;
  let complete = true;
  for (let i = 0; i < ttmRecords.length; i++) {
    if (netIncomes[i]!.value === null || ocfs[i] === null) {
      complete = false;
    } else {
      netIncomeTtmSum += netIncomes[i]!.value!;
      ocfTtmSum += ocfs[i]!;
    }
  }

  const value = complete ? toRatio(ocfTtmSum, netIncomeTtmSum) : null;

  const entries: ProvenanceEntry[] = ttmQuarters.flatMap((tq, i): ProvenanceEntry[] => {
    const entryFiscalYear = rocYearToGregorian(Number(tq.year));
    const entryFiscalQuarter = Number(tq.season);
    return [
      {
        role: `近一年 淨利（${trailingPeriodLabel(tq, trailingIncome.basis)}）`,
        fiscalYear: entryFiscalYear,
        fiscalQuarter: entryFiscalQuarter,
        type: 'statementField',
        statementType: 'incomeStatement',
        fieldKey: netIncomes[i]!.fieldKey,
        sourceDescription: null,
        value: toProvenanceEntryValue(netIncomes[i]!.value),
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

  return { symbol, metricCode: 'ocfToNetIncome', found: true, fiscalYear, fiscalQuarter: seasonNum, value, entries, methodologyNote: null };
};
