import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import type { MetricNullReason } from '@/domain/metrics/metricBasis';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { computation, isComputationSkip, noQuarterBatch, type ComputationBatch, type ComputationSlot, type MetricComputation } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';
import { computeEpsGrowthRate } from '@/application/metrics/growth/epsGrowthRate/computeEpsGrowthRate';
import { computeRevenueGrowthRate } from '@/application/metrics/growth/revenueGrowthRate/computeRevenueGrowthRate';
import { computeEpsCagrFamily } from '@/application/metrics/growth/epsCagr/computeEpsCagrFamily';
import { computeRoe } from '@/application/metrics/profitability/roe/computeRoe';

// O'Neil CAN SLIM 基本面評分（0-4）：四條各自復用既有指標的 compute，在程序內直接呼叫拿 slot——
// 不讀 metric_values（全市場回填是 Promise.allSettled 平行跑，讀庫會跟同批次的寫入競賽，第一次跑
// 會讀到空的），也不重寫任何一條公式（四支子指標的公式改了，這裡自動跟著改）。
//
// 座標對齊：這支先用 incomeStatement 解析出這次要算的季（跟 epsGrowthRate/revenueGrowthRate 同一個
// 錨定來源），再把明確的 year/season 塞進 query 傳給四支子 compute，四條保證落在同一個
// (fiscalYear, fiscalQuarter)——epsCagr 家族的 FY 列本來就用查詢當下的季別當 fiscalQuarter（見
// computeEpsCagrFamily.ts），roe 取 ttm slot，另外兩支取 q slot。
//
// 四個門檻的出處與選擇理由見 oneilCanslimScoreBadge.ts；這裡只負責「通過幾條」，門檻常數放
// domain 層集中管理，徽章跟計算共用同一組數字，不會兩邊漂掉。
export const CANSLIM_THRESHOLDS = {
  epsGrowthRateMin: 25, // C-1：當季 EPS 較去年同季 ≥ 25%（O'Neil 偏好值；書中最低可接受 18%）
  revenueGrowthRateMin: 25, // C-2：當季營收較去年同季 ≥ 25%
  epsCagr3yMin: 25, // A-1：三年 EPS 年化成長 ≥ 25%
  roeMin: 17, // A-2：ROE ≥ 17%
} as const;

// 四條各自的判定結果——null 代表那一條算不出來（子指標 value 為 null），整支就是 null。
export interface CanslimSignals {
  epsGrowthRate: boolean | null; // C-1
  revenueGrowthRate: boolean | null; // C-2
  epsCagr3y: boolean | null; // A-1
  roe: boolean | null; // A-2
}

export type OneilCanslimScoreDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'shares'>;

export type OneilCanslimScoreComputationBatch = ComputationBatch<'q'>;

const passes = (slot: MetricComputation, min: number): boolean | null => (slot.value === null ? null : slot.value >= min);

// 四條裡任一條算不出來時的 null 原因：insufficient_history 優先（A-1 缺歷史是目前最常見的原因，
// 對使用者最有解釋力），其次沿用第一條為 null 的子指標自己的原因，都沒有就 missing_input。
const pickNullReason = (slots: MetricComputation[]): MetricNullReason => {
  const nullSlots = slots.filter((s) => s.value === null);
  if (nullSlots.some((s) => s.nullReason === 'insufficient_history')) return 'insufficient_history';
  return nullSlots.find((s) => s.nullReason !== null)?.nullReason ?? 'missing_input';
};

export const computeOneilCanslimScore = async (query: QuarterlyMetricQuery, deps: OneilCanslimScoreDeps): Promise<OneilCanslimScoreComputationBatch> => {
  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement'], deps.quarters);
  if (!resolvedQuarter) return noQuarterBatch(query.symbol, ['q']);

  const { year, season } = resolvedQuarter;
  const pinned: QuarterlyMetricQuery = { ...query, year, season };

  const [eps, revenue, cagr, roe] = await Promise.all([
    computeEpsGrowthRate(pinned, deps),
    computeRevenueGrowthRate(pinned, deps),
    computeEpsCagrFamily(pinned, deps),
    computeRoe(pinned, deps),
  ]);

  const rawSlots: ComputationSlot[] = [eps.slots.q, revenue.slots.q, cagr.slots['epsCagr3y']!, roe.slots.ttm];

  // 任一條連座標都沒解析出來（skip）就整支 skip——理由跟那一條一樣（沒有季 / 沒有 knowledge date）。
  const skipped = rawSlots.find(isComputationSkip);
  if (skipped) {
    return { symbol: query.symbol, rocYear: year, season, slots: { q: skipped } };
  }
  const slots = rawSlots as MetricComputation[];
  const [epsSlot, revenueSlot, cagrSlot, roeSlot] = slots as [MetricComputation, MetricComputation, MetricComputation, MetricComputation];

  const signals: CanslimSignals = {
    epsGrowthRate: passes(epsSlot, CANSLIM_THRESHOLDS.epsGrowthRateMin),
    revenueGrowthRate: passes(revenueSlot, CANSLIM_THRESHOLDS.revenueGrowthRateMin),
    epsCagr3y: passes(cagrSlot, CANSLIM_THRESHOLDS.epsCagr3yMin),
    roe: passes(roeSlot, CANSLIM_THRESHOLDS.roeMin),
  };
  const signalValues = Object.values(signals);
  const allEvaluated = signalValues.every((s) => s !== null);
  const score = allEvaluated ? signalValues.reduce((sum: number, s) => sum + (s ? 1 : 0), 0) : null;

  // knowledge date 取四條的最大值、isFallback 任一為 true 就是 true——跟 TTM 四季加總的傳染規則一致。
  const knowledgeDate = new Date(Math.max(...slots.map((s) => s.knowledgeDate.getTime())));
  const knowledgeDateIsFallback = slots.some((s) => s.knowledgeDateIsFallback);

  const q = computation({
    symbol: query.symbol,
    metricCode: 'oneilCanslimScore',
    fiscalYear: rocYearToGregorian(Number(year)),
    fiscalQuarter: Number(season),
    dataType: query.dataType,
    subsidiaryCompanyId: query.subsidiaryCompanyId,
    ...periodTypeGroup('Q'),
    value: score,
    nullReason: score === null ? pickNullReason(slots) : null,
    knowledgeDate,
    knowledgeDateIsFallback,
  });

  return { symbol: query.symbol, rocYear: year, season, slots: { q } };
};
