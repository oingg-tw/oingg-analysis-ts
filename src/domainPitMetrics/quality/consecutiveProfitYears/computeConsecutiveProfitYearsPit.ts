import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { pickNetIncome } from '@/domainPitMetrics/shared/pickers';
import { financialDataAdapter, type IncomeStatementPort } from '@/domainPitMetrics/shared/ports/financialDataPorts';
import { getPastNQuarters, rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeOrSkip } from '../../metricValueWriter';
import type { StandardBasisPitOutcome } from '../../pitOutcome';
import type { MetricNullReason } from '../../metricBasis';

// 跟 consecutiveDividendYears 同一套「逐年往回數」設計，換成看「這年淨利是不是正的」
// 而不是「這年有沒有配息」，見 consecutiveDividendYears/computeConsecutiveDividendYearsPit.ts
// 的說明——這裡不重複展開同樣的設計理由。

const MAX_LOOKBACK_YEARS = 30;

export type ConsecutiveProfitYearsPitOutcome = StandardBasisPitOutcome;

export const computeAndWriteConsecutiveProfitYearsPit = async (query: QuarterlyMetricQuery, statements: IncomeStatementPort = financialDataAdapter): Promise<ConsecutiveProfitYearsPitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement']);

  if (!resolvedQuarter) {
    return { symbol, rocYear: null, season: null, fy: { action: 'skipped_no_quarter' } };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const mainIncomeStatement = await statements.getIncomeStatement({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate: mainIncomeStatement?.reportDate ?? null }]);

  const latestCompleteFiscalYear = seasonNum === 4 ? rocYear : rocYear - 1;

  let consecutiveYears = 0;
  let cursorRocYear = latestCompleteFiscalYear;
  let firstYearDataAvailable = false;

  for (let i = 0; i < MAX_LOOKBACK_YEARS; i++) {
    const yearQuarters = getPastNQuarters({ rocYear: cursorRocYear, season: '4' }, 4);
    const records = await Promise.all(
      yearQuarters.map((q) => statements.getIncomeStatement({ symbol, year: Number(q.year), quarter: Number(q.season), dataType, subsidiaryCompanyId }))
    );

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

  const fy = await writeOrSkip(mainAnchor, coordinateBase, 'FY', value, nullReason);

  return { symbol, rocYear: year, season, fy };
};
