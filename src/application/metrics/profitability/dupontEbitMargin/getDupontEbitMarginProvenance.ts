import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import { trailingPeriodLabel, resolveTrailingIncomeStatements } from '../../shared/trailingYear';
import { toPercent } from '@/domain/metrics/shared/numericHelpers';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-13 使用者要求擴大稽核鏈——dupontEbitMargin(TTM) = 近四季 EBIT(=稅前淨利+財務
// 費用)加總 / 近四季營收加總。跟 computeDupontFamilyPit.ts 一致，EBIT 定義跟
// dupontInterestBurden/interestCoverage 同一個公式，但這裡分母換成營收。固定回傳 TTM。

export const getDupontEbitMarginProvenance = async (query: QuarterlyMetricQuery, deps: Pick<PitDeps, 'statements' | 'quarters' | 'cumulativeStatements'>): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'dupontEbitMargin', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  // 2026-10-01 近一年改走共用來源，跟 compute 同一份資料（興櫃半年頻，見 shared/trailingYear.ts）。
  const trailing = await resolveTrailingIncomeStatements({ symbol, rocYear, season: season as Season, dataType, subsidiaryCompanyId }, deps);
  const ttmQuarters = trailing.periods;
  const ttmRecords = trailing.periods.map((p) => p.record);
  const preTaxes = ttmRecords.map((record) => record?.profitBeforeTax ?? null);
  const financeCosts = ttmRecords.map((record) => record?.financeCosts ?? null);
  const revenues = ttmRecords.map((record) => record?.operatingRevenue ?? null);

  let ebitTtmSum = 0n;
  let revenueTtmSum = 0n;
  let complete = true;
  for (let i = 0; i < ttmRecords.length; i++) {
    if (preTaxes[i] === null || financeCosts[i] === null || revenues[i] === null) {
      complete = false;
    } else {
      ebitTtmSum += preTaxes[i]! + financeCosts[i]!;
      revenueTtmSum += revenues[i]!;
    }
  }

  const value = complete ? toPercent(ebitTtmSum, revenueTtmSum) : null;

  const entries: ProvenanceEntry[] = ttmQuarters.flatMap((tq, i) => {
    const entryFiscalYear = rocYearToGregorian(Number(tq.year));
    const entryFiscalQuarter = Number(tq.season);
    return [
      {
        role: `近一年 稅前淨利（${trailingPeriodLabel(tq, trailing.basis)}，用於 EBIT）`,
        fiscalYear: entryFiscalYear,
        fiscalQuarter: entryFiscalQuarter,
        type: 'statementField' as const,
        statementType: 'incomeStatement' as const,
        fieldKey: 'profit_loss_before_tax',
        sourceDescription: null,
        value: toProvenanceEntryValue(preTaxes[i]),
      },
      {
        role: `近一年 財務費用（${trailingPeriodLabel(tq, trailing.basis)}，用於 EBIT）`,
        fiscalYear: entryFiscalYear,
        fiscalQuarter: entryFiscalQuarter,
        type: 'statementField' as const,
        statementType: 'incomeStatement' as const,
        fieldKey: 'finance_costs',
        sourceDescription: null,
        value: toProvenanceEntryValue(financeCosts[i]),
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

  return {
    symbol,
    metricCode: 'dupontEbitMargin',
    found: true,
    fiscalYear,
    fiscalQuarter: seasonNum,
    value,
    entries,
    methodologyNote: 'EBIT 不是財報原始欄位，是稅前淨利 + 財務費用相加得出的中繼值，見上方原始欄位。',
  };
};
