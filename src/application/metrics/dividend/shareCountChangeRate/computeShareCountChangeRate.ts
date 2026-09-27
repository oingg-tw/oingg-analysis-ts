import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { type ComputationBatch, noQuarterBatch, periodSlot, withFormulaVersion } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-26 formulaVersion 2：流通股數改為 IAS 33 流通在外普通股（已發行 − 特別股 − 庫藏股），EPS 類分子扣特別股股利、
// 每股淨值類分子扣特別股股本；讀股數或市值的指標一起跳版，讓下游有訊號知道值變了（使用者 2026-09-26 拍板）。
// 2026-09-27 formulaVersion 3：跨期比較的每股數字做面額還原（股票分割不算每股價值變化，IAS 33 追溯調整前期；使用者：「盡可能反映內在價值的變化」）。
// 2026-09-28 formulaVersion 4：跨期還原加上股票股利（配股）與股數合併式減資（使用者：「只是股數變了、公司價值沒變」的都換算，IAS 33 對配股、分割、反分割都追溯調整）。
export const SHARE_COUNT_CHANGE_RATE_FORMULA_VERSION = 4;

export type ShareCountChangeRateDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'shares'>;

export type ShareCountChangeRateComputationBatch = ComputationBatch<'q'>;

// 股本變化率（YoY）= (本季流通股數 - 去年同季流通股數) / 去年同季流通股數 * 100。正值代表
// 股數增加（現金增資/可轉債轉換等稀釋股東權益），負值代表股數減少（庫藏股註銷減資）。去年
// 同季用 getPastNQuarters({rocYear,season},5)[0] 取得（5 季前，取最舊那一筆），跟
// piotroskiFScore 的既有慣例一致，不是專門的新機制。只有 Q 一種 basis——流通股數是資產
// 負債表時點快照，沒有 TTM/年化概念（跟 bvps/stockPrice 同一種性質）。
export const computeShareCountChangeRate = async (query: QuarterlyMetricQuery, deps: ShareCountChangeRateDeps): Promise<ShareCountChangeRateComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet'], deps.quarters);

  if (!resolvedQuarter) {
    return noQuarterBatch(symbol, ['q']);
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const balanceSheet = await deps.statements.getBalanceSheet(key);
  const reportDate = balanceSheet?.reportDate ?? null;
  const currentShares = reportDate ? await deps.shares.getOutstandingCommonShares(symbol, reportDate) : null;

  const prior = getPastNQuarters({ rocYear, season: season as Season }, 5)[0]!;
  const priorBalanceSheet = await deps.statements.getBalanceSheet({
    symbol,
    year: Number(prior.year),
    quarter: Number(prior.season),
    dataType,
    subsidiaryCompanyId,
  });
  const priorReportDate = priorBalanceSheet?.reportDate ?? null;
  const priorShares = priorReportDate ? await deps.shares.getOutstandingCommonShares(symbol, priorReportDate) : null;

  const currentValue = currentShares?.outstandingCommonShares ?? null;
  // 去年同季的股數換算到本季的面額基準：面額變更（股票分割）讓股數翻倍不是增資稀釋，不該算進股本變化率。
  const splitFactor = priorReportDate && reportDate ? await deps.shares.getShareSplitFactor(symbol, priorReportDate, reportDate) : 1;
  const priorValue = priorShares ? BigInt(Math.round(Number(priorShares.outstandingCommonShares) * splitFactor)) : null;

  const changeRate =
    currentValue !== null && priorValue !== null && priorValue !== 0n
      ? Math.round((Number(currentValue - priorValue) / Number(priorValue)) * 100 * 100) / 100
      : null;
  const nullReason: MetricNullReason | null = changeRate !== null ? null : currentValue === null || priorValue === null ? 'missing_input' : 'zero_or_negative_denominator';

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);
  const coordinateBase = { symbol, metricCode: 'shareCountChangeRate', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  const q = periodSlot(mainAnchor, coordinateBase, 'Q', changeRate, nullReason);

  return { symbol, rocYear: year, season, slots: withFormulaVersion({ q }, SHARE_COUNT_CHANGE_RATE_FORMULA_VERSION) };
};
