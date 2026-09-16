import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { financialDataAdapter, type CashFlowStatementPort, type PaidInSharesPort } from '@/application/metrics/shared/ports/financialDataPorts';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, periodTypeGroup } from '../../metricValueWriter';
import type { BasisOutcome, QuarterlyPitOutcomeBase } from '../../pitOutcome';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { DIVIDEND_GROWTH_RATE_YEARS } from '../../../../domain/metrics/dividend/dividendGrowthRate/dividendGrowthRateDefinition';

export interface DividendGrowthRateFamilyPitOutcome extends QuarterlyPitOutcomeBase {
  results: Record<string, BasisOutcome>;
}

// 股利 3/5/8 年成長率（現金流量近似版）——同一組年度「近似每股股利」快取，拆多個回溯窗口，
// 跟 revenueCagr/epsCagr 家族同一套設計。年度近似每股股利 = 4 季 dividendsPaid 加總的絕對值
// / 當年 Q4 報告日流通股數，見 dividendGrowthRateDefinition.ts 的 variant_of 說明。
const getAnnualDividendPerShareProxy = async (
  cache: Map<number, number | null>,
  symbol: string,
  rocYear: number,
  dataType: string,
  subsidiaryCompanyId: string,
  statements: CashFlowStatementPort & PaidInSharesPort
): Promise<number | null> => {
  if (cache.has(rocYear)) return cache.get(rocYear)!;

  const quarters = await Promise.all(
    [1, 2, 3, 4].map((quarter) => statements.getCashFlowStatement({ symbol, year: rocYear, quarter, dataType, subsidiaryCompanyId }))
  );
  if (quarters.some((q) => q === null || q.dividendsPaid === null)) {
    cache.set(rocYear, null);
    return null;
  }

  const yearSum = quarters.reduce((sum, q) => sum + q!.dividendsPaid!, 0n);
  const dividendsPaidAbs = yearSum < 0n ? -yearSum : yearSum;
  const q4ReportDate = quarters[3]!.reportDate;
  const shares = await statements.getPaidInShares(symbol, q4ReportDate);
  if (!shares) {
    cache.set(rocYear, null);
    return null;
  }

  // 金額單位是千元，股數是實際股數，分子要先 x1000 換算成元（跟 eps.ts 等既有慣例一致）。
  const value = (Number(dividendsPaidAbs) * 1000) / Number(shares.paidInShares);
  cache.set(rocYear, value);
  return value;
};

export const computeAndWriteDividendGrowthRateFamilyPit = async (
  query: QuarterlyMetricQuery,
  statements: CashFlowStatementPort & PaidInSharesPort = financialDataAdapter
): Promise<DividendGrowthRateFamilyPitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['cashFlowStatement']);

  if (!resolvedQuarter) {
    return {
      symbol,
      rocYear: null,
      season: null,
      results: Object.fromEntries(DIVIDEND_GROWTH_RATE_YEARS.map((y) => [`dividendGrowthRate${y}y`, { action: 'skipped_no_quarter' as const }])),
    };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const mainCashFlow = await statements.getCashFlowStatement({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate: mainCashFlow?.reportDate ?? null }]);

  const latestCompleteFiscalYear = seasonNum === 4 ? rocYear : rocYear - 1;
  const cache = new Map<number, number | null>();
  const currentDps = await getAnnualDividendPerShareProxy(cache, symbol, latestCompleteFiscalYear, dataType, subsidiaryCompanyId, statements);

  const results: Record<string, BasisOutcome> = {};

  for (const years of DIVIDEND_GROWTH_RATE_YEARS) {
    const metricCode = `dividendGrowthRate${years}y`;
    const priorDps = await getAnnualDividendPerShareProxy(cache, symbol, latestCompleteFiscalYear - years, dataType, subsidiaryCompanyId, statements);

    const cagrPct =
      currentDps !== null && priorDps !== null && priorDps > 0 ? Math.round((Math.pow(currentDps / priorDps, 1 / years) - 1) * 100 * 100) / 100 : null;

    let nullReason: MetricNullReason | null = null;
    if (cagrPct === null) {
      nullReason = currentDps === null || priorDps === null ? 'insufficient_history' : 'zero_or_negative_denominator';
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
