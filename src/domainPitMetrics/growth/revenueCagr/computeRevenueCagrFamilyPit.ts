import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { financialDataAdapter, type IncomeStatementPort } from '@/domainPitMetrics/shared/ports/financialDataPorts';
import { rocYearToGregorian } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, type MetricValueWriteOutcome, periodTypeGroup } from '../../metricValueWriter';
import type { MetricNullReason } from '../../metricBasis';
import { REVENUE_CAGR_YEARS } from './revenueCagrDefinition';

// 營收 3/5/8 年複合成長率——一次查詢，拆多個 metric_code（跟 dupont/margins 家族同一種
// 「一次查詢、拆多個 metric_code」模式，這裡是「同一組年度營收快取，拆多個回溯窗口」）。
// 每個窗口各自需要「最近一個完整會計年度」跟「N 年前的那個完整會計年度」兩個年度的年營收
// （4 季 operatingRevenue 加總），用一個 Map 快取已經查過的年度，避免 3 個窗口重複查詢
// 同一年度（例如最近一個完整年度這個查詢只需要做一次，3/5/8 年前則各自不同）。

type BasisOutcome = MetricValueWriteOutcome | { action: 'skipped_no_knowledge_date' } | { action: 'skipped_no_quarter' };

export interface RevenueCagrFamilyPitOutcome {
  symbol: string;
  rocYear: string | null;
  season: string | null;
  results: Record<string, BasisOutcome>;
}

const getAnnualRevenue = async (
  cache: Map<number, bigint | null>,
  symbol: string,
  rocYear: number,
  dataType: string,
  subsidiaryCompanyId: string,
  statements: IncomeStatementPort
): Promise<bigint | null> => {
  if (cache.has(rocYear)) return cache.get(rocYear)!;

  const quarters = await Promise.all(
    [1, 2, 3, 4].map((quarter) => statements.getIncomeStatement({ symbol, year: rocYear, quarter, dataType, subsidiaryCompanyId }))
  );
  const value = quarters.some((q) => q === null || q.operatingRevenue === null) ? null : quarters.reduce((sum, q) => sum + q!.operatingRevenue!, 0n);
  cache.set(rocYear, value);
  return value;
};

export const computeAndWriteRevenueCagrFamilyPit = async (query: QuarterlyMetricQuery, statements: IncomeStatementPort = financialDataAdapter): Promise<RevenueCagrFamilyPitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['incomeStatement']);

  if (!resolvedQuarter) {
    return { symbol, rocYear: null, season: null, results: Object.fromEntries(REVENUE_CAGR_YEARS.map((y) => [`revenueCagr${y}y`, { action: 'skipped_no_quarter' as const }])) };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const mainIncomeStatement = await statements.getIncomeStatement({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate: mainIncomeStatement?.reportDate ?? null }]);

  const latestCompleteFiscalYear = seasonNum === 4 ? rocYear : rocYear - 1;
  const cache = new Map<number, bigint | null>();
  const currentRevenue = await getAnnualRevenue(cache, symbol, latestCompleteFiscalYear, dataType, subsidiaryCompanyId, statements);

  const results: Record<string, BasisOutcome> = {};

  for (const years of REVENUE_CAGR_YEARS) {
    const metricCode = `revenueCagr${years}y`;
    const priorRevenue = await getAnnualRevenue(cache, symbol, latestCompleteFiscalYear - years, dataType, subsidiaryCompanyId, statements);

    const cagrPct =
      currentRevenue !== null && priorRevenue !== null && priorRevenue > 0n
        ? Math.round((Math.pow(Number(currentRevenue) / Number(priorRevenue), 1 / years) - 1) * 100 * 100) / 100
        : null;

    let nullReason: MetricNullReason | null = null;
    if (cagrPct === null) {
      nullReason = currentRevenue === null || priorRevenue === null ? 'insufficient_history' : 'zero_or_negative_denominator';
    }

    const coordinateBase = { symbol, metricCode, fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

    if (!mainAnchor) {
      results[metricCode] = { action: 'skipped_no_knowledge_date' };
    } else {
      results[metricCode] = await writeMetricValue({
        ...coordinateBase,
        ...periodTypeGroup('FY'),
        value: cagrPct,
        nullReason,
        knowledgeDate: mainAnchor.knowledgeDate,
        knowledgeDateIsFallback: mainAnchor.isFallback,
      });
    }
  }

  return { symbol, rocYear: year, season, results };
};
