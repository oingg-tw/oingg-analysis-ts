import { resolveQuarterOrLatest } from '@/models/latestQuarter';
import { determineNullReason, toPercent } from '@/domainPitMetrics/shared/numericHelpers';
import { pickEquityValue as pickEquity } from '@/domainPitMetrics/shared/pickers';
import { financialDataAdapter, type BalanceSheetPort } from '@/domainPitMetrics/shared/ports/financialDataPorts';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, periodTypeGroup } from '../../metricValueWriter';
import type { BasisOutcome, StandardBasisPitOutcome } from '../../pitOutcome';
import type { MetricNullReason } from '../../metricBasis';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';

// 量化選股盤點使用者要求新增。有息負債定義同 evEbitda/evToEbit（短期借款+應付公司債+
// 長期借款），權益 pickEquity 慣例同 altmanZDoublePrimeScore。純資產負債表時點快照，
// 只有 Q 一種 basis。

export type TotalDebtToCapitalPitOutcome = StandardBasisPitOutcome;

export const computeAndWriteTotalDebtToCapitalPit = async (query: QuarterlyMetricQuery, statements: BalanceSheetPort = financialDataAdapter): Promise<TotalDebtToCapitalPitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet']);

  if (!resolvedQuarter) {
    return { symbol, rocYear: null, season: null, q: { action: 'skipped_no_quarter' } };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const balanceSheet = await statements.getBalanceSheet(key);
  const totalDebt = balanceSheet
    ? (balanceSheet.shortTermBorrowings ?? 0n) + (balanceSheet.bondsPayable ?? 0n) + (balanceSheet.longTermBorrowings ?? 0n)
    : null;
  const equity = pickEquity(balanceSheet);
  const reportDate = balanceSheet?.reportDate ?? null;

  const denominator = totalDebt !== null && equity !== null ? totalDebt + equity : null;
  const value = totalDebt !== null && denominator !== null ? toPercent(totalDebt, denominator) : null;
  const nullReason: MetricNullReason | null = value === null ? determineNullReason(totalDebt, denominator) : null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);

  let q: BasisOutcome;
  if (!mainAnchor) {
    q = { action: 'skipped_no_knowledge_date' };
  } else {
    q = await writeMetricValue({
      symbol,
      metricCode: 'totalDebtToCapital',
      fiscalYear,
      fiscalQuarter: seasonNum,
      dataType,
      subsidiaryCompanyId,
      ...periodTypeGroup('Q'),
      value,
      nullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  }

  return { symbol, rocYear: year, season, q };
};
