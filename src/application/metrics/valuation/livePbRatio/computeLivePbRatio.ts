import { resolveLivePerShare, type LivePerShareDeps, type LivePerShareQuery } from '@/application/metrics/shared/livePerShare';
import { toRatioFromNumbers } from '@/domain/metrics/shared/numericHelpers';
import { resolveDailyCadenceKnowledgeDate } from '../../knowledgeDate';
import type { MetricNullReason } from '@/domain/metrics/metricBasis';
import { snapshotCadenceGroup } from '@/domain/metrics/coordinate';
import { computation, type DailyComputationBatch, withFormulaVersion } from '@/domain/metrics/computation';

// 2026-09-27 新增（使用者：「希望我們網站的數據不要跟交易所一樣慢，畢竟除息當天股價就變了」）——股價淨值比的即時版本：
// 當天收盤價 ÷ 普通股每股淨值，每股淨值從最新一季財報出發、套用季末之後的除息（現金股利）、除權、面額換發、減資、增資
// （見 application/metrics/shared/livePerShare.ts）。實測交易所的股價淨值比在除息日、減資恢復交易日都不動
// （6669 除息 144 元、1808 減資兩成，反推的每股淨值要到下一季財報那天才變）。跟 pbRatio、exchangePbRatio 刻意並存。
// 每股淨值為負仍算出負值（跟 pbRatio 一致），剛好 0 才是 null。逐日型，knowledgeDate＝交易日。
export const LIVE_PB_RATIO_FORMULA_VERSION = 1;

export type LivePbRatioComputationBatch = DailyComputationBatch<'eod'>;

export const computeLivePbRatio = async (query: LivePerShareQuery, deps: LivePerShareDeps): Promise<LivePbRatioComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;
  const live = await resolveLivePerShare(query, ['balanceSheet'], deps);
  if (live.status === 'no_trade_date') return { symbol, tradeDate: null, slots: { eod: { action: 'skipped_no_trade_date' } } };
  if (live.status === 'no_quarter') return { symbol, tradeDate: live.tradeDate.toISOString().slice(0, 10), slots: { eod: { action: 'skipped_no_quarter' } } };
  const { tradeDate, close } = live;

  const value = live.bvps !== null ? toRatioFromNumbers(close, live.bvps) : null;
  let nullReason: MetricNullReason | null = null;
  if (value === null) {
    nullReason = live.bvps === null ? 'missing_input' : 'zero_or_negative_denominator';
  }

  const { knowledgeDate } = resolveDailyCadenceKnowledgeDate(tradeDate);
  const eod = computation({
    symbol,
    metricCode: 'livePbRatio',
    ...snapshotCadenceGroup('EOD'),
    dataType,
    subsidiaryCompanyId,
    tradeDate,
    value,
    nullReason,
    knowledgeDate,
    knowledgeDateIsFallback: false,
  });
  return { symbol, tradeDate: tradeDate.toISOString().slice(0, 10), slots: withFormulaVersion({ eod }, LIVE_PB_RATIO_FORMULA_VERSION) };
};
