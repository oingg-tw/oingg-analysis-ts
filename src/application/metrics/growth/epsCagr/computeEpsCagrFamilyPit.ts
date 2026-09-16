import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { pickNetIncome } from '@/domain/metrics/shared/pickers';
import { financialDataAdapter, type IncomeStatementPort, type PaidInSharesPort } from '@/application/metrics/shared/ports/financialDataPorts';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, periodTypeGroup } from '../../metricValueWriter';
import type { BasisOutcome, QuarterlyPitOutcomeBase } from '../../pitOutcome';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { EPS_CAGR_YEARS } from '../../../../domain/metrics/growth/epsCagr/epsCagrDefinition';

export interface EpsCagrFamilyPitOutcome extends QuarterlyPitOutcomeBase {
  results: Record<string, BasisOutcome>;
}

// EPS 3/5/8 年複合成長率——同一組年度 EPS 快取，拆多個回溯窗口，跟 revenueCagr 家族同一套
// 設計。年度 EPS = 4 季淨利加總（歸屬母公司優先，缺漏退回整體口徑）/ 當年 Q4 報告日流通股數。
const getAnnualEps = async (
  cache: Map<number, number | null>,
  symbol: string,
  rocYear: number,
  dataType: string,
  subsidiaryCompanyId: string,
  statements: IncomeStatementPort & PaidInSharesPort
): Promise<number | null> => {
  if (cache.has(rocYear)) return cache.get(rocYear)!;

  const quarters = await Promise.all(
    [1, 2, 3, 4].map((quarter) => statements.getIncomeStatement({ symbol, year: rocYear, quarter, dataType, subsidiaryCompanyId }))
  );
  if (quarters.some((q) => q === null || pickNetIncome(q).value === null)) {
    cache.set(rocYear, null);
    return null;
  }

  const netIncomeSum = quarters.reduce((sum, q) => sum + pickNetIncome(q).value!, 0n);
  const q4ReportDate = quarters[3]!.reportDate;
  const shares = await statements.getPaidInShares(symbol, q4ReportDate);
  if (!shares) {
    cache.set(rocYear, null);
    return null;
  }

  // 金額單位是千元，股數是實際股數，分子要先 x1000 換算成元（跟 eps.ts 等既有慣例一致）。
  const value = (Number(netIncomeSum) * 1000) / Number(shares.paidInShares);
  cache.set(rocYear, value);
  return value;
};

export const computeAndWriteEpsCagrFamilyPit = async (
  query: QuarterlyMetricQuery,
  statements: IncomeStatementPort & PaidInSharesPort = financialDataAdapter
): Promise<EpsCagrFamilyPitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement']);

  if (!resolvedQuarter) {
    return { symbol, rocYear: null, season: null, results: Object.fromEntries(EPS_CAGR_YEARS.map((y) => [`epsCagr${y}y`, { action: 'skipped_no_quarter' as const }])) };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const mainIncomeStatement = await statements.getIncomeStatement({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate: mainIncomeStatement?.reportDate ?? null }]);

  const latestCompleteFiscalYear = seasonNum === 4 ? rocYear : rocYear - 1;
  const cache = new Map<number, number | null>();
  const currentEps = await getAnnualEps(cache, symbol, latestCompleteFiscalYear, dataType, subsidiaryCompanyId, statements);

  const results: Record<string, BasisOutcome> = {};

  for (const years of EPS_CAGR_YEARS) {
    const metricCode = `epsCagr${years}y`;
    const priorEps = await getAnnualEps(cache, symbol, latestCompleteFiscalYear - years, dataType, subsidiaryCompanyId, statements);

    const cagrPct =
      currentEps !== null && priorEps !== null && currentEps > 0 && priorEps > 0
        ? Math.round((Math.pow(currentEps / priorEps, 1 / years) - 1) * 100 * 100) / 100
        : null;

    let nullReason: MetricNullReason | null = null;
    if (cagrPct === null) {
      nullReason = currentEps === null || priorEps === null ? 'insufficient_history' : 'zero_or_negative_denominator';
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
