import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { pickNetIncomeWithFieldKey as pickNetIncome } from '@/domain/metrics/shared/pickers';
import { rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import { trailingPeriodLabel, resolveTrailingIncomeStatements } from '../../shared/trailingYear';
import { toPercent } from '@/domain/metrics/shared/numericHelpers';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-13 使用者要求擴大稽核鏈——netProfitMargin(TTM) = 近四季淨利加總 / 近四季營收
// 加總。跟 computeDupontFamilyPit.ts 一致（該檔案是 netProfitMargin 唯一的寫入路徑）。
// 固定回傳 TTM。

export const getNetProfitMarginProvenance = async (query: QuarterlyMetricQuery, deps: Pick<PitDeps, 'statements' | 'quarters' | 'cumulativeStatements'>): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'netProfitMargin', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  // 2026-10-01 近一年改走共用來源，跟 compute 同一份資料（興櫃半年頻，見 shared/trailingYear.ts）。
  const trailing = await resolveTrailingIncomeStatements({ symbol, rocYear, season: season as Season, dataType, subsidiaryCompanyId }, deps);
  const ttmQuarters = trailing.periods;
  const ttmRecords = trailing.periods.map((p) => p.record);
  const netIncomes = ttmRecords.map(pickNetIncome);
  const revenues = ttmRecords.map((record) => record?.operatingRevenue ?? null);

  let netIncomeTtmSum = 0n;
  let revenueTtmSum = 0n;
  let complete = true;
  for (let i = 0; i < ttmRecords.length; i++) {
    if (netIncomes[i]!.value === null || revenues[i] === null) {
      complete = false;
    } else {
      netIncomeTtmSum += netIncomes[i]!.value!;
      revenueTtmSum += revenues[i]!;
    }
  }

  const value = complete ? toPercent(netIncomeTtmSum, revenueTtmSum) : null;

  const entries: ProvenanceEntry[] = ttmQuarters.flatMap((tq, i) => {
    const entryFiscalYear = rocYearToGregorian(Number(tq.year));
    const entryFiscalQuarter = Number(tq.season);
    return [
      {
        role: `近一年 淨利（${trailingPeriodLabel(tq, trailing.basis)}）`,
        fiscalYear: entryFiscalYear,
        fiscalQuarter: entryFiscalQuarter,
        type: 'statementField' as const,
        statementType: 'incomeStatement' as const,
        fieldKey: netIncomes[i]!.fieldKey,
        sourceDescription: null,
        value: toProvenanceEntryValue(netIncomes[i]!.value),
      },
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
    ];
  });

  return { symbol, metricCode: 'netProfitMargin', found: true, fiscalYear, fiscalQuarter: seasonNum, value, entries, methodologyNote: null };
};
