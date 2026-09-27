import { resolveLivePerShare, type LivePerShareDeps, type LivePerShareQuery } from '@/application/metrics/shared/livePerShare';
import { toRatioFromNumbers } from '@/domain/metrics/shared/numericHelpers';
import { resolveDailyCadenceKnowledgeDate } from '../../knowledgeDate';
import type { MetricNullReason } from '@/domain/metrics/metricBasis';
import { snapshotCadenceGroup } from '@/domain/metrics/coordinate';
import { computation, type DailyComputationBatch, withFormulaVersion } from '@/domain/metrics/computation';

// 2026-09-27 新增（使用者：「希望我們網站的數據不要跟交易所一樣慢，畢竟除息當天股價就變了」）——本益比的即時版本：
// 當天收盤價 ÷ 近四季 EPS，EPS 換算到跟當天股價同一基準（季末之後的除權、面額換發、減資恢復交易照 IAS 33 追溯換算，
// 見 application/metrics/shared/livePerShare.ts）。交易所公告的本益比（exchangePeRatio）EPS 只在新財報公布時更新，
// 除權、減資後到下一季財報之間基準對不上。跟 peRatio（凍結在財報公告日股價）、exchangePeRatio 刻意並存。
// EPS 為負仍算出負的本益比（跟 peRatio 一致），剛好 0 才是 null。逐日型，knowledgeDate＝交易日。
export const LIVE_PE_RATIO_FORMULA_VERSION = 1;

export type LivePeRatioComputationBatch = DailyComputationBatch<'eod'>;

export const computeLivePeRatio = async (query: LivePerShareQuery, deps: LivePerShareDeps): Promise<LivePeRatioComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;
  const live = await resolveLivePerShare(query, ['incomeStatement'], deps);
  if (live.status === 'no_trade_date') return { symbol, tradeDate: null, slots: { eod: { action: 'skipped_no_trade_date' } } };
  if (live.status === 'no_quarter') return { symbol, tradeDate: live.tradeDate.toISOString().slice(0, 10), slots: { eod: { action: 'skipped_no_quarter' } } };
  const { tradeDate, close } = live;

  const value = live.epsTtm !== null ? toRatioFromNumbers(close, live.epsTtm) : null;
  let nullReason: MetricNullReason | null = null;
  if (value === null) {
    if (!live.ttmComplete) nullReason = 'insufficient_history';
    else if (live.epsTtm === null) nullReason = 'missing_input';
    else nullReason = 'zero_or_negative_denominator';
  }

  const { knowledgeDate } = resolveDailyCadenceKnowledgeDate(tradeDate);
  const eod = computation({
    symbol,
    metricCode: 'livePeRatio',
    ...snapshotCadenceGroup('EOD'),
    dataType,
    subsidiaryCompanyId,
    tradeDate,
    value,
    nullReason,
    knowledgeDate,
    knowledgeDateIsFallback: false,
  });
  return { symbol, tradeDate: tradeDate.toISOString().slice(0, 10), slots: withFormulaVersion({ eod }, LIVE_PE_RATIO_FORMULA_VERSION) };
};
