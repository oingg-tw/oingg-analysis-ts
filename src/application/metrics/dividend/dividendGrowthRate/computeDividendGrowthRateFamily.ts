import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { DIVIDEND_GROWTH_RATE_YEARS } from '../../../../domain/metrics/dividend/dividendGrowthRate/dividendGrowthRateDefinition';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { computation, type ComputationBatch, type ComputationSlot, withFormulaVersion } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';
import { resolveTrailingCashFlowStatements } from '../../shared/trailingYear';

// 2026-09-26 formulaVersion 2：流通股數改為 IAS 33 流通在外普通股（已發行 − 特別股 − 庫藏股），EPS 類分子扣特別股股利、
// 每股淨值類分子扣特別股股本；讀股數或市值的指標一起跳版，讓下游有訊號知道值變了（使用者 2026-09-26 拍板）。
// 2026-09-27 formulaVersion 3：跨期比較的每股數字做面額還原（股票分割不算每股價值變化，IAS 33 追溯調整前期；使用者：「盡可能反映內在價值的變化」）。
// 2026-09-28 formulaVersion 4：跨期還原加上股票股利（配股）與股數合併式減資（使用者：「只是股數變了、公司價值沒變」的都換算，IAS 33 對配股、分割、反分割都追溯調整）。
export const DIVIDEND_GROWTH_RATE_FORMULA_VERSION = 4;

// 股利 3/5/8 年成長率（現金流量近似版）——同一組年度「近似每股股利」快取，拆多個回溯窗口，
// 跟 revenueCagr/epsCagr 家族同一套設計。年度近似每股股利 = 4 季 dividendsPaid 加總的絕對值
// / 當年 Q4 報告日流通股數，見 dividendGrowthRateDefinition.ts 的 variant_of 說明。
// 面額還原：每一年的每股數字都換算到「所有已知面額變更之後」的股數基準，CAGR 比的是兩年比值，基準日選哪天都會抵銷。
// 每次呼叫才建立（模組載入時建的 Date 常數在錄製器凍結 Date 之後會被當成非 Date 編碼，cassette 對不上）。
const splitRestateBasis = (): Date => new Date(Date.UTC(9999, 0, 1));
const getAnnualDividendPerShareProxy = async (
  cache: Map<number, number | null>,
  symbol: string,
  rocYear: number,
  dataType: string,
  subsidiaryCompanyId: string,
  deps: DividendGrowthRateFamilyDeps
): Promise<number | null> => {
  if (cache.has(rocYear)) return cache.get(rocYear)!;

  // 2026-10-01 年度加總改走共用近一年來源（興櫃半年頻：上下半年，見 shared/trailingYear.ts）；上市櫃仍是該年度四季。
  const trailing = await resolveTrailingCashFlowStatements({ symbol, rocYear, season: '4', dataType, subsidiaryCompanyId }, deps);
  const quarters = trailing.periods.map((p) => p.record);
  // 2026-09-22 mops-ts 確認單季現金流量表的語意：該季有整份表但 dividends_paid_financing 為 null = 「本年度到這季為止還沒付過股利」
  // （台股多在 Q3 付款，Q1/Q2 的累計表根本沒這行），不是缺資料——所以只有整季報表缺席才算不齊，科目 null 視為 0。
  if (quarters.some((q) => q === null)) {
    cache.set(rocYear, null);
    return null;
  }

  const yearSum = quarters.reduce((sum, q) => sum + (q!.dividendsPaid ?? 0n), 0n);
  const dividendsPaidAbs = yearSum < 0n ? -yearSum : yearSum;
  const q4ReportDate = quarters.at(-1)!.reportDate;
  const shares = await deps.shares.getOutstandingCommonShares(symbol, q4ReportDate);
  if (!shares) {
    cache.set(rocYear, null);
    return null;
  }

  // 金額單位是千元，股數是實際股數，分子要先 x1000 換算成元（跟 eps.ts 等既有慣例一致）。
  const value = (Number(dividendsPaidAbs) * 1000) / Number(shares.outstandingCommonShares);
  const restated = value / (await deps.shares.getShareSplitFactor(symbol, q4ReportDate, splitRestateBasis()));
  cache.set(rocYear, restated);
  return restated;
};

export type DividendGrowthRateFamilyDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'shares' | 'cumulativeStatements'>;

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

  return { symbol, rocYear: year, season, slots: withFormulaVersion(results, DIVIDEND_GROWTH_RATE_FORMULA_VERSION) };
};
