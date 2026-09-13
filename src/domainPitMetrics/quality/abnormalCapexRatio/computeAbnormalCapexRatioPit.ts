import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { financialDataAdapter, type CashFlowStatementPort } from '@/domainPitMetrics/shared/ports/financialDataPorts';
import { rocYearToGregorian } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, type MetricValueWriteOutcome, periodTypeGroup } from '../../metricValueWriter';
import type { MetricNullReason } from '../../metricBasis';

// Titman, Wei & Xie (2004) 異常資本投資比率——只有一個回溯窗口（前三年平均），跟
// revenueCagr 家族「同一組年度快取、拆多個回溯窗口」是同一種年度快取模式，這裡只是
// 單一窗口不需要拆多個 metric_code。資本支出來源資料是負值（現金流出），年度加總後
// 取絕對值，跟 capexToRevenue 同一種慣例。

type BasisOutcome = MetricValueWriteOutcome | { action: 'skipped_no_knowledge_date' } | { action: 'skipped_no_quarter' };

export interface AbnormalCapexRatioPitOutcome {
  symbol: string;
  rocYear: string | null;
  season: string | null;
  fy: BasisOutcome;
}

const abs = (value: bigint): bigint => (value < 0n ? -value : value);

const getAnnualCapex = async (
  cache: Map<number, bigint | null>,
  symbol: string,
  rocYear: number,
  dataType: string,
  subsidiaryCompanyId: string,
  statements: CashFlowStatementPort
): Promise<bigint | null> => {
  if (cache.has(rocYear)) return cache.get(rocYear)!;

  const quarters = await Promise.all(
    [1, 2, 3, 4].map((quarter) => statements.getCashFlowStatement({ symbol, year: rocYear, quarter, dataType, subsidiaryCompanyId }))
  );
  const value = quarters.some((q) => q === null || q.capitalExpenditures === null) ? null : abs(quarters.reduce((sum, q) => sum + q!.capitalExpenditures!, 0n));
  cache.set(rocYear, value);
  return value;
};

export const computeAndWriteAbnormalCapexRatioPit = async (query: QuarterlyMetricQuery, statements: CashFlowStatementPort = financialDataAdapter): Promise<AbnormalCapexRatioPitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['cashFlowStatement']);

  if (!resolvedQuarter) {
    return { symbol, rocYear: null, season: null, fy: { action: 'skipped_no_quarter' } };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const mainCashFlowStatement = await statements.getCashFlowStatement({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate: mainCashFlowStatement?.reportDate ?? null }]);

  const latestCompleteFiscalYear = seasonNum === 4 ? rocYear : rocYear - 1;
  const cache = new Map<number, bigint | null>();

  const currentCapex = await getAnnualCapex(cache, symbol, latestCompleteFiscalYear, dataType, subsidiaryCompanyId, statements);
  const priorCapexValues = await Promise.all(
    [1, 2, 3].map((yearsAgo) => getAnnualCapex(cache, symbol, latestCompleteFiscalYear - yearsAgo, dataType, subsidiaryCompanyId, statements))
  );

  let ciPct: number | null = null;
  let nullReason: MetricNullReason | null = null;

  if (currentCapex === null) {
    nullReason = 'missing_input';
  } else if (priorCapexValues.some((v) => v === null)) {
    nullReason = 'insufficient_history';
  } else {
    const priorAverage = priorCapexValues.reduce((sum, v) => sum! + v!, 0n) as bigint;
    if (priorAverage === 0n) {
      nullReason = 'zero_or_negative_denominator';
    } else {
      ciPct = Math.round((Number(currentCapex) / (Number(priorAverage) / 3) - 1) * 100 * 100) / 100;
    }
  }

  const coordinateBase = { symbol, metricCode: 'abnormalCapexRatio', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  let fy: BasisOutcome;
  if (!mainAnchor) {
    fy = { action: 'skipped_no_knowledge_date' };
  } else {
    fy = await writeMetricValue({
      ...coordinateBase,
      ...periodTypeGroup('FY'),
      value: ciPct,
      nullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  }

  return { symbol, rocYear: year, season, fy };
};
