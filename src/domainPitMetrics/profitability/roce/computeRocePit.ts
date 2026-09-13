import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { financialDataAdapter, type IncomeStatementPort, type BalanceSheetPort } from '@/domainPitMetrics/shared/ports/financialDataPorts';

import { getPastNQuarters, rocYearToGregorian, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, type MetricValueWriteOutcome, periodTypeGroup } from '../../metricValueWriter';
import type { MetricNullReason } from '../../metricBasis';

// 這份檔案是 src/domainMetrics/roce.ts 的獨立重新實作。EBIT = 稅前淨利+利息費用，這個公式
// 在 interestCoverage/netDebtToEbitda/roic/roce 四個舊架構檔案各自重複定義，延續既有慣例。

const computeEbit = (record: { profitBeforeTax: bigint | null; financeCosts: bigint | null } | null): bigint | null => {
  if (!record || record.profitBeforeTax === null || record.financeCosts === null) return null;
  return record.profitBeforeTax + record.financeCosts;
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

export interface RocePitOutcome {
  symbol: string;
  rocYear: string | null;
  season: string | null;
  q: BasisOutcome;
  qAnn: BasisOutcome;
  ttm: BasisOutcome;
}

export const computeAndWriteRocePit = async (query: QuarterlyMetricQuery, statements: IncomeStatementPort & BalanceSheetPort = financialDataAdapter): Promise<RocePitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['balanceSheet', 'incomeStatement']);

  if (!resolvedQuarter) {
    return {
      symbol,
      rocYear: null,
      season: null,
      q: { action: 'skipped_no_quarter' },
      qAnn: { action: 'skipped_no_quarter' },
      ttm: { action: 'skipped_no_quarter' },
    };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const [balanceSheet, incomeStatement] = await Promise.all([statements.getBalanceSheet(key), statements.getIncomeStatement(key)]);

  const ebit = computeEbit(incomeStatement);
  const totalAssets = balanceSheet?.totalAssets ?? null;
  const currentLiabilities = balanceSheet?.currentLiabilities ?? null;
  const capitalEmployed = totalAssets !== null && currentLiabilities !== null ? totalAssets - currentLiabilities : null;
  const reportDate = balanceSheet?.reportDate ?? incomeStatement?.reportDate ?? null;

  const roceQuarterlyPct = ebit !== null && capitalEmployed !== null ? toPct(ebit, capitalEmployed) : null;
  const roceQuarterlyAnnualizedPct = roceQuarterlyPct !== null ? Math.round(roceQuarterlyPct * 4 * 100) / 100 : null;
  const quarterlyNullReason: MetricNullReason | null = roceQuarterlyPct === null ? determineNullReason(ebit, capitalEmployed) : null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);
  const coordinateBase = { symbol, metricCode: 'roce', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  let q: BasisOutcome;
  let qAnn: BasisOutcome;
  if (!mainAnchor) {
    q = { action: 'skipped_no_knowledge_date' };
    qAnn = { action: 'skipped_no_knowledge_date' };
  } else {
    q = await writeMetricValue({
      ...coordinateBase,
      ...periodTypeGroup('Q'),
      value: roceQuarterlyPct,
      nullReason: quarterlyNullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
    qAnn = await writeMetricValue({
      ...coordinateBase,
      ...periodTypeGroup('Q_ANN'),
      value: roceQuarterlyAnnualizedPct,
      nullReason: quarterlyNullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  }

  // TTM：近四季（含本季）EBIT 加總，使用資本固定用本季期末值（不平均不加總）。
  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => statements.getIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );

  let ebitTtmSum = 0n;
  let ttmComplete = true;
  for (const record of ttmRecords) {
    const quarterEbit = computeEbit(record);
    if (quarterEbit === null) {
      ttmComplete = false;
    } else {
      ebitTtmSum += quarterEbit;
    }
  }

  const ttmValue = ttmComplete && capitalEmployed !== null ? toPct(ebitTtmSum, capitalEmployed) : null;
  const ttmNullReason: MetricNullReason | null = ttmValue !== null ? null : ttmComplete ? determineNullReason(ebitTtmSum, capitalEmployed) : 'insufficient_history';

  let ttm: BasisOutcome;
  if (ttmComplete) {
    const ttmAnchor = await resolveKnowledgeDate(
      symbol,
      ttmQuarters.map((tq, i) => ({ rocYear: Number(tq.year), season: Number(tq.season), reportDate: ttmRecords[i]?.reportDate ?? null }))
    );
    if (!ttmAnchor) {
      ttm = { action: 'skipped_no_knowledge_date' };
    } else {
      ttm = await writeMetricValue({
        ...coordinateBase,
        ...periodTypeGroup('TTM'),
        value: ttmValue,
        nullReason: ttmNullReason,
        knowledgeDate: ttmAnchor.knowledgeDate,
        knowledgeDateIsFallback: ttmAnchor.isFallback,
      });
    }
  } else if (mainAnchor) {
    ttm = await writeMetricValue({
      ...coordinateBase,
      ...periodTypeGroup('TTM'),
      value: null,
      nullReason: 'insufficient_history',
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  } else {
    ttm = { action: 'skipped_no_knowledge_date' };
  }

  return { symbol, rocYear: year, season, q, qAnn, ttm };
};
