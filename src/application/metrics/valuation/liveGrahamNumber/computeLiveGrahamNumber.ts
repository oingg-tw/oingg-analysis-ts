import { resolveLivePerShare, type LivePerShareDeps } from '@/application/metrics/shared/livePerShare';
import { resolveDailyCadenceKnowledgeDate } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { snapshotCadenceGroup } from '@/domain/metrics/coordinate';
import { computation, type DailyComputationBatch } from '@/domain/metrics/computation';

// 2026-09-22 formulaVersion 2：同 grahamNumber：中繼值不四捨五入，只在最後一次（見 numericHelpers.ts toPerShareExact 的說明）。
// 2026-09-26 formulaVersion 3：流通股數改為 IAS 33 流通在外普通股（已發行 − 特別股 − 庫藏股），EPS 類分子扣特別股股利、
// 每股淨值類分子扣特別股股本；讀股數或市值的指標一起跳版，讓下游有訊號知道值變了（使用者 2026-09-26 拍板）。
// 2026-09-27 formulaVersion 4：每股淨值與 EPS 換算到跟當天股價同一基準——季末之後的除息、除權、面額換發、減資恢復交易、增資都套用
// （見 application/metrics/shared/livePerShare.ts；使用者：「希望我們網站的數據不要跟交易所一樣慢，除息當天股價就變了」）。
export const LIVE_GRAHAM_NUMBER_FORMULA_VERSION = 4;

// 2026-09-11 應 web-nuxt 要求新增——grahamNumber（季報快照，PER/PBR 都用財報公告當天的
// 股價，凍結在 knowledge_date）的即時版本：基本面（EPS TTM/BVPS）維持用「最新已申報」的
// 資料，但股價改用當下最新收盤價（getLatestDailyPrice），每個交易日都會變動，跟
// grahamNumber 是刻意並存、互不影響的兩支獨立 metricCode（liveXxx vs Xxx 的命名/資料源
// 分工方式，直接沿用 exchangePeRatio vs peRatio 那組「刻意並存、不要混用或互相驗證」的
// 既有先例）。公式跟 nullReason 判斷邏輯完全複製自 grahamNumber，只有價格來源不同。
//
// 逐日型（snapshotCadence='EOD'，寫進 metric_daily_cadence_values），knowledgeDate =
// 交易日本身（resolveDailyCadenceKnowledgeDate，isFallback 恆為 false）——跟
// marketRatios（exchangePeRatio 等）同一套逐日型慣例，不是季報型的
// resolveKnowledgeDate。

export interface LiveGrahamNumberPitQuery {
  symbol: string;
  dataType: '1' | '2';
  subsidiaryCompanyId: string;
}

export type LiveGrahamNumberDeps = LivePerShareDeps;

export type LiveGrahamNumberComputationBatch = DailyComputationBatch<'eod'>;

export const computeLiveGrahamNumber = async (query: LiveGrahamNumberPitQuery, deps: LiveGrahamNumberDeps): Promise<LiveGrahamNumberComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const live = await resolveLivePerShare(query, ['balanceSheet', 'incomeStatement'], deps);
  if (live.status === 'no_trade_date') return { symbol, tradeDate: null, slots: { eod: { action: 'skipped_no_trade_date' } } };
  if (live.status === 'no_quarter') return { symbol, tradeDate: live.tradeDate.toISOString().slice(0, 10), slots: { eod: { action: 'skipped_no_quarter' } } };
  const { tradeDate, close, epsTtm, bvps, ttmComplete } = live;

  const pbRatio = bvps !== null && bvps !== 0 ? close / bvps : null;
  const peRatioTtm = epsTtm !== null && epsTtm !== 0 ? close / epsTtm : null;

  const liveGrahamNumber = peRatioTtm !== null && pbRatio !== null ? Math.round(peRatioTtm * pbRatio * 100) / 100 : null;

  let nullReason: MetricNullReason | null = null;
  if (liveGrahamNumber === null) {
    if (!ttmComplete) nullReason = 'insufficient_history';
    else if (epsTtm === null || bvps === null) nullReason = 'missing_input';
    else nullReason = 'zero_or_negative_denominator';
  }

  const { knowledgeDate } = resolveDailyCadenceKnowledgeDate(tradeDate);

  const eod = computation({
    symbol,
    metricCode: 'liveGrahamNumber',
    ...snapshotCadenceGroup('EOD'),
    dataType,
    subsidiaryCompanyId,
    tradeDate,
    value: liveGrahamNumber,
    nullReason,
    knowledgeDate,
    knowledgeDateIsFallback: false,
  });

  return { symbol, tradeDate: tradeDate.toISOString().slice(0, 10), slots: { eod: { ...eod, formulaVersion: LIVE_GRAHAM_NUMBER_FORMULA_VERSION } } };
};
