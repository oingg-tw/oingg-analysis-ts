import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { DIVIDEND_GROWTH_RATE_YEARS } from '../../../../domain/metrics/dividend/dividendGrowthRate/dividendGrowthRateDefinition';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { computation, type ComputationBatch, type ComputationSlot } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';

// 股利 3/5/8 年成長率（現金流量近似版）——同一組年度「近似每股股利」快取，拆多個回溯窗口，
// 跟 revenueCagr/epsCagr 家族同一套設計。年度近似每股股利 = 4 季 dividendsPaid 加總的絕對值
// / 當年 Q4 報告日流通股數，見 dividendGrowthRateDefinition.ts 的 variant_of 說明。
const getAnnualDividendPerShareProxy = async (
  cache: Map<number, number | null>,
  symbol: string,
  rocYear: number,
  dataType: string,
  subsidiaryCompanyId: string,
  deps: DividendGrowthRateFamilyDeps
): Promise<number | null> => {
  if (cache.has(rocYear)) return cache.get(rocYear)!;

  const quarters = await Promise.all(
    [1, 2, 3, 4].map((quarter) => deps.statements.getCashFlowStatement({ symbol, year: rocYear, quarter, dataType, subsidiaryCompanyId }))
  );
  // 2026-09-22 mops-ts 確認單季現金流量表的語意：該季有整份表但 dividends_paid_financing 為 null = 「本年度到這季為止還沒付過股利」
  // （台股多在 Q3 付款，Q1/Q2 的累計表根本沒這行），不是缺資料——所以只有整季報表缺席才算不齊，科目 null 視為 0。
  if (quarters.some((q) => q === null)) {
    cache.set(rocYear, null);
    return null;
  }

  const yearSum = quarters.reduce((sum, q) => sum + (q!.dividendsPaid ?? 0n), 0n);
  const dividendsPaidAbs = yearSum < 0n ? -yearSum : yearSum;
  const q4ReportDate = quarters[3]!.reportDate;
  const shares = await deps.shares.getPaidInShares(symbol, q4ReportDate);
  if (!shares) {
    cache.set(rocYear, null);
    return null;
  }

  // 金額單位是千元，股數是實際股數，分子要先 x1000 換算成元（跟 eps.ts 等既有慣例一致）。
  const value = (Number(dividendsPaidAbs) * 1000) / Number(shares.paidInShares);
  cache.set(rocYear, value);
  return value;
};

export type DividendGrowthRateFamilyDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'shares'>;

// slot key 是 `dividendGrowthRate${N}y`（3/5/8），舊 outcome 把它們巢狀在 results 底下（shim 用 runLegacyPitNested 包回去）。
export type DividendGrowthRateFamilyComputationBatch = ComputationBatch<string>;

export const computeDividendGrowthRateFamily = async (
  query: QuarterlyMetricQuery,
  deps: DividendGrowthRateFamilyDeps
): Promise<DividendGrowthRateFamilyComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['cashFlowStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return { symbol, rocYear: null, season: null, slots: Object.fromEntries(DIVIDEND_GROWTH_RATE_YEARS.map((y) => [`dividendGrowthRate${y}y`, { action: 'skipped_no_quarter' as const }])) };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const mainCashFlow = await deps.statements.getCashFlowStatement({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate: mainCashFlow?.reportDate ?? null }], deps.announcements);

  const latestCompleteFiscalYear = seasonNum === 4 ? rocYear : rocYear - 1;
  const cache = new Map<number, number | null>();
  const currentDps = await getAnnualDividendPerShareProxy(cache, symbol, latestCompleteFiscalYear, dataType, subsidiaryCompanyId, deps);

  const results: Record<string, ComputationSlot> = {};

  for (const years of DIVIDEND_GROWTH_RATE_YEARS) {
    const metricCode = `dividendGrowthRate${years}y`;
    const priorDps = await getAnnualDividendPerShareProxy(cache, symbol, latestCompleteFiscalYear - years, dataType, subsidiaryCompanyId, deps);

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
      results[metricCode] = computation({
        ...coordinateBase,
        ...periodTypeGroup('FY'),
        value: cagrPct,
        nullReason,
        knowledgeDate: mainAnchor.knowledgeDate,
        knowledgeDateIsFallback: mainAnchor.isFallback,
      });
    }
  }

  return { symbol, rocYear: year, season, slots: results };
};
