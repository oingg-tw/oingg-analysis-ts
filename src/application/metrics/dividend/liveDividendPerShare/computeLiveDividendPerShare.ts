import { resolveDailyCadenceKnowledgeDate } from '../../knowledgeDate';
import { calculateDividendPerShare } from '@/domain/metrics/dividend/dividendPerShare/calculateDividendPerShare';
import { snapshotCadenceGroup } from '@/domain/metrics/coordinate';
import { computation, type DailyComputationBatch, withFormulaVersion } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';
import { listRestatedDividendRows } from '../dividendPerShare/computeDividendPerShare';

// 近 12 個月每股現金股利（截至最新交易日），見定義檔。窗口終點＝最新收盤價的交易日（除息日當天就已實現：那天開盤已經除息），
// 加總與面額還原跟 dividendPerShare 共用同一批函式（calculateDividendPerShare、listRestatedDividendRows），只換窗口終點。
export const LIVE_DIVIDEND_PER_SHARE_FORMULA_VERSION = 1;

export interface LiveDividendPerShareQuery {
  symbol: string;
  dataType: '1' | '2';
  subsidiaryCompanyId: string;
}

export type LiveDividendPerShareDeps = Pick<PitDeps, 'market' | 'dividendEvents' | 'shares'>;

export const computeLiveDividendPerShare = async (query: LiveDividendPerShareQuery, deps: LiveDividendPerShareDeps): Promise<DailyComputationBatch<'eod'>> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;
  const latestPrice = await deps.market.getLatestDailyPrice(symbol);
  if (!latestPrice) return { symbol, tradeDate: null, slots: { eod: { action: 'skipped_no_trade_date' } } };
  const { tradeDate } = latestPrice;

  const calc = calculateDividendPerShare(await listRestatedDividendRows(symbol, tradeDate, deps), tradeDate);
  const { knowledgeDate } = resolveDailyCadenceKnowledgeDate(tradeDate);
  const eod = computation({
    symbol,
    metricCode: 'liveDividendPerShare',
    ...snapshotCadenceGroup('EOD'),
    dataType,
    subsidiaryCompanyId,
    tradeDate,
    value: calc.value,
    nullReason: calc.nullReason,
    knowledgeDate,
    knowledgeDateIsFallback: false,
  });
  return { symbol, tradeDate: tradeDate.toISOString().slice(0, 10), slots: withFormulaVersion({ eod }, LIVE_DIVIDEND_PER_SHARE_FORMULA_VERSION) };
};
