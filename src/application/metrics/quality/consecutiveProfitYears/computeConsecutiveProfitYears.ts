import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { pickNetIncome } from '@/domain/metrics/shared/pickers';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { type ComputationBatch, noQuarterBatch, periodSlot } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';
import { resolveTrailingIncomeStatements } from '@/application/metrics/shared/trailingYear';

// 跟 consecutiveDividendYears 同一套「逐年往回數」設計，換成看「這年淨利是不是正的」
// 而不是「這年有沒有配息」，見 consecutiveDividendYears/computeConsecutiveDividendYearsPit.ts
// 的說明——這裡不重複展開同樣的設計理由。

const MAX_LOOKBACK_YEARS = 30;


export type ConsecutiveProfitYearsDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'cumulativeStatements'>;

export type ConsecutiveProfitYearsComputationBatch = ComputationBatch<'fy'>;

export const computeConsecutiveProfitYears = async (query: QuarterlyMetricQuery, deps: ConsecutiveProfitYearsDeps): Promise<ConsecutiveProfitYearsComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return noQuarterBatch(symbol, ['fy']);
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const mainIncomeStatement = await deps.statements.getIncomeStatement({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate: mainIncomeStatement?.reportDate ?? null }], deps.announcements);

  const latestCompleteFiscalYear = seasonNum === 4 ? rocYear : rocYear - 1;

  let consecutiveYears = 0;
  let cursorRocYear = latestCompleteFiscalYear;
  let firstYearDataAvailable = false;

  for (let i = 0; i < MAX_LOOKBACK_YEARS; i++) {
    // 2026-10-01 全年改走共用「近一年」來源（興櫃半年頻，見 shared/trailingYear.ts）：上市櫃＝該年四季、興櫃＝該年上下半年。
    const trailing = await resolveTrailingIncomeStatements({ symbol, rocYear: cursorRocYear, season: '4', dataType, subsidiaryCompanyId }, deps);
    const records = trailing.periods.map((p) => p.record);

    if (records.some((r) => r === null || pickNetIncome(r).value === null)) break;
    firstYearDataAvailable = true;

    const yearNetIncome = records.reduce((sum, r) => sum + pickNetIncome(r).value!, 0n);
    if (yearNetIncome <= 0n) break;

    consecutiveYears += 1;
    cursorRocYear -= 1;
  }

  const value = firstYearDataAvailable ? consecutiveYears : null;
  const nullReason: MetricNullReason | null = value === null ? 'insufficient_history' : null;

  const coordinateBase = { symbol, metricCode: 'consecutiveProfitYears', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  const fy = periodSlot(mainAnchor, coordinateBase, 'FY', value, nullReason);

  return { symbol, rocYear: year, season, slots: { fy } };
};
