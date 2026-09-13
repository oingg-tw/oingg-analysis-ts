import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { financialDataAdapter, type BalanceSheetPort } from '@/domainPitMetrics/shared/ports/financialDataPorts';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, type MetricValueWriteOutcome, periodTypeGroup } from '../../metricValueWriter';
import type { MetricNullReason } from '../../metricBasis';
import { rocYearToGregorian } from '@/shared/rocQuarter';

// 量化選股盤點使用者要求新增。有息負債定義同 evEbitda/evToEbit（短期借款+應付公司債+
// 長期借款），權益 pickEquity 慣例同 altmanZDoublePrimeScore。純資產負債表時點快照，
// 只有 Q 一種 basis。

const pickEquity = (record: { equityAttributableToParent: bigint | null; totalEquity: bigint | null } | null): bigint | null => {
  if (!record) return null;
  if (record.equityAttributableToParent !== null) return record.equityAttributableToParent;
  return record.totalEquity;
};

const toPct = (numerator: bigint, denominator: bigint): number | null => {
  if (denominator === 0n) return null;
  return Math.round((Number(numerator) / Number(denominator)) * 100 * 100) / 100;
};

const determineNullReason = (numerator: bigint | null, denominator: bigint | null): MetricNullReason => {
  if (numerator === null || denominator === null) return 'missing_input';
  return 'zero_or_negative_denominator';
};

type BasisOutcome = MetricValueWriteOutcome | { action: 'skipped_no_knowledge_date' } | { action: 'skipped_no_quarter' };

export interface TotalDebtToCapitalPitOutcome {
  symbol: string;
  rocYear: string | null;
  season: string | null;
  q: BasisOutcome;
}

export const computeAndWriteTotalDebtToCapitalPit = async (query: QuarterlyMetricQuery, statements: BalanceSheetPort = financialDataAdapter): Promise<TotalDebtToCapitalPitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['balanceSheet']);

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
  const value = totalDebt !== null && denominator !== null ? toPct(totalDebt, denominator) : null;
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
