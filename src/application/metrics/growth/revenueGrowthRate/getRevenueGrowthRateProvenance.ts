import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { calculateYoyGrowthRateBigint } from '@/domain/metrics/shared/numericHelpers';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import type { PitDeps } from '@/application/metrics/deps';
import { withBankIncome, type BankAware } from '../../shared/bankAwareIncome';
import { BANK_INCOME_METHODOLOGY_NOTE, bankRevenueEntries } from '../../shared/provenance/bankIncomeEntries';
import type { IncomeStatementFields } from '@/application/ports/financialStatements';

// 2026-09-13 使用者要求擴大稽核鏈——revenueGrowthRate（單季年增率）= (本季營收 - 去年同季
// 營收) / |去年同季營收| * 100。跟 computeRevenueGrowthRatePit.ts 一致。只有 Q 一種 basis。

export const getRevenueGrowthRateProvenance = async (query: QuarterlyMetricQuery, deps: Pick<PitDeps, 'statements' | 'quarters'>): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'revenueGrowthRate', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  // 2026-10-08 純銀行用銀行口徑營收，跟 compute 同一個 resolver（見 shared/bankAwareIncome.ts）。
  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const incomeStatement = await withBankIncome(await deps.statements.getIncomeStatement(key), key, deps);
  const currentRevenue = incomeStatement?.operatingRevenue ?? null;

  const prior = getPastNQuarters({ rocYear, season: season as Season }, 5)[0]!;
  const priorRocYear = Number(prior.year);
  const priorSeason = Number(prior.season);
  const priorKey = { symbol, year: priorRocYear, quarter: priorSeason, dataType, subsidiaryCompanyId };
  const priorIncomeStatement = await withBankIncome(await deps.statements.getIncomeStatement(priorKey), priorKey, deps);
  const priorRevenue = priorIncomeStatement?.operatingRevenue ?? null;

  const { value } = calculateYoyGrowthRateBigint(currentRevenue, priorRevenue);

  const revenueEntries = (prefix: string, record: BankAware<IncomeStatementFields> | null, entryFiscalYear: number, entryFiscalQuarter: number, revenue: bigint | null): ProvenanceEntry[] =>
    record?.revenueSource === 'bank'
      ? bankRevenueEntries(prefix, { label: `${entryFiscalYear} 年第 ${entryFiscalQuarter} 季`, fiscalYear: entryFiscalYear, fiscalQuarter: entryFiscalQuarter }, { interestIncome: record.interestIncome, bank: record.bank! })
      : [{ role: `${prefix}營收`, fiscalYear: entryFiscalYear, fiscalQuarter: entryFiscalQuarter, type: 'statementField', statementType: 'incomeStatement', fieldKey: 'revenue', sourceDescription: null, value: toProvenanceEntryValue(revenue) }];
  const entries: ProvenanceEntry[] = [
    ...revenueEntries('本季', incomeStatement, fiscalYear, seasonNum, currentRevenue),
    ...revenueEntries('去年同季', priorIncomeStatement, rocYearToGregorian(priorRocYear), priorSeason, priorRevenue),
  ];

  const methodologyNote = incomeStatement?.revenueSource === 'bank' || priorIncomeStatement?.revenueSource === 'bank' ? BANK_INCOME_METHODOLOGY_NOTE : null;
  return { symbol, metricCode: 'revenueGrowthRate', found: true, fiscalYear, fiscalQuarter: seasonNum, value, entries, methodologyNote };
};
