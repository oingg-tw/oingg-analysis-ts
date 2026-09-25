import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { toPerShareExact } from '@/domain/metrics/shared/numericHelpers';
import { pickNetIncome } from '@/domain/metrics/shared/pickers';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { isComputationSkip, computation, type ComputationBatch, type ComputationSlot, noQuarterBatch } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-22 formulaVersion 2：中繼 EPS 改用不四捨五入的 toPerShareExact（見 numericHelpers.ts toPerShareExact 的說明）。
// 2026-09-26 formulaVersion 3：流通股數改為 IAS 33 流通在外普通股（已發行 − 特別股 − 庫藏股），EPS 類分子扣特別股股利、
// 每股淨值類分子扣特別股股本；讀股數或市值的指標一起跳版，讓下游有訊號知道值變了（使用者 2026-09-26 拍板）。
export const EARNINGS_YIELD_FORMULA_VERSION = 3;

// 盈餘收益率（EY）= EPS(TTM) / 股價 * 100，是本益比的倒數換算成百分比呈現——獨立重新計算
// EPS_TTM/股價（不依賴 eps/peRatio 這兩個 metric_code 已寫入的值，跟 sgr 對 roe/
// dividendPayoutRatio 的既有做法一致），公式/資料源直接複製自 peRatio 的既有邏輯。
// 跟 peRatio 不同：peRatio 分母為 0 才是 null，這裡分母（股價）不太可能是 0，反而要留意
// 股價缺漏；EPS_TTM 為負時 EY 一樣算出真實但為負的值，不隱藏成 null（跟 peRatio 虧損時
// 本益比為負同一個判斷）。


export type EarningsYieldDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'shares' | 'market'>;

export type EarningsYieldComputationBatch = ComputationBatch<'ttm'>;

export const computeEarningsYield = async (
  query: QuarterlyMetricQuery,
  deps: EarningsYieldDeps
): Promise<EarningsYieldComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return noQuarterBatch(symbol, ['ttm']);
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const incomeStatement = await deps.statements.getIncomeStatement(key);
  const reportDate = incomeStatement?.reportDate ?? null;

  const shares = reportDate ? await deps.shares.getOutstandingCommonShares(symbol, reportDate) : null;
  const sharesValue = shares?.outstandingCommonShares ?? null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);
  const stockPrice = mainAnchor ? await deps.market.getStockPrice(symbol, mainAnchor.knowledgeDate) : null;

  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => deps.statements.getIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );

  let ttmSum = 0n;
  let ttmComplete = true;
  for (const record of ttmRecords) {
    const picked = pickNetIncome(record);
    if (picked.value === null) {
      ttmComplete = false;
    } else {
      ttmSum += picked.value;
    }
  }

  // 2026-09-25 分子只算普通股：近四季淨利扣近四季特別股股利（見 domain/financials/outstandingCommonShares.ts）。
  const epsTtm = ttmComplete && sharesValue !== null ? toPerShareExact(ttmSum - (shares?.preferredDividendsTtmThousands ?? 0n), sharesValue) : null;
  const earningsYieldTtm =
    epsTtm !== null && stockPrice !== null && stockPrice.closePrice !== 0 ? Math.round((epsTtm / stockPrice.closePrice) * 100 * 100) / 100 : null;

  let ttmNullReason: MetricNullReason | null = null;
  if (earningsYieldTtm === null) {
    if (!ttmComplete) ttmNullReason = 'insufficient_history';
    else if (epsTtm === null || stockPrice === null) ttmNullReason = 'missing_input';
    else ttmNullReason = 'zero_or_negative_denominator';
  }

  const coordinateBase = { symbol, metricCode: 'earningsYield', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  let ttm: ComputationSlot;
  if (ttmComplete) {
    const ttmAnchor = await resolveKnowledgeDate(
      symbol,
      ttmQuarters.map((tq, i) => ({ rocYear: Number(tq.year), season: Number(tq.season), reportDate: ttmRecords[i]?.reportDate ?? null })), deps.announcements
    );
    if (!ttmAnchor) {
      ttm = { action: 'skipped_no_knowledge_date' };
    } else {
      ttm = computation({
        ...coordinateBase,
        ...periodTypeGroup('TTM'),
        value: earningsYieldTtm,
        nullReason: ttmNullReason,
        knowledgeDate: ttmAnchor.knowledgeDate,
        knowledgeDateIsFallback: ttmAnchor.isFallback,
      });
    }
  } else if (mainAnchor) {
    ttm = computation({
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

  return { symbol, rocYear: year, season, slots: { ttm: isComputationSkip(ttm) ? ttm : { ...ttm, formulaVersion: EARNINGS_YIELD_FORMULA_VERSION } } };
};
