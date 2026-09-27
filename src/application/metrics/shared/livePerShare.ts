import { getLatestAvailableQuarter } from '@/application/financials/latestQuarter';
import { toCommonEquity } from '@/domain/financials/outstandingCommonShares';
import { rollForwardPerShare } from '@/domain/financials/liveShareBasis';
import { pickEquity, pickNetIncome } from '@/domain/metrics/shared/pickers';
import { getPastNQuarters, type Season } from '@/domain/calendar/rocQuarter';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-27 即時指標共用的「跟當天股價同一基準」的每股淨值與 EPS（TTM）（使用者：「希望我們網站的數據不要跟交易所一樣慢」）。
// 從最新已申報那一季的普通股權益、近四季淨利、季末流通股數出發，套用季末之後到交易日的除息、除權、面額換發、減資恢復交易、
// 增資（見 domain/financials/liveShareBasis.ts）。livePeRatio／livePbRatio／liveGrahamNumber／livePegRatio 都從這裡取，
// 原本各支自己用「最新收盤價 ÷ 季末每股數字」，面額變更、配股後基準對不上（5904 換發後會差 10 倍）。
export type LivePerShareDeps = Pick<PitDeps, 'statements' | 'quarters' | 'shares' | 'market'>;

export interface LivePerShareQuery {
  symbol: string;
  dataType: '1' | '2';
  subsidiaryCompanyId: string;
}

export type LivePerShare =
  | { status: 'no_trade_date' }
  | { status: 'no_quarter'; tradeDate: Date }
  | { status: 'ok'; tradeDate: Date; close: number; rocYear: number; season: number; epsTtm: number | null; bvps: number | null; ttmComplete: boolean };

export const resolveLivePerShare = async (
  query: LivePerShareQuery,
  sources: ('balanceSheet' | 'incomeStatement')[],
  deps: LivePerShareDeps
): Promise<LivePerShare> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;
  const latestPrice = await deps.market.getLatestDailyPrice(symbol);
  if (!latestPrice || latestPrice.close === null) return { status: 'no_trade_date' };
  const { tradeDate, close } = latestPrice;

  const resolvedQuarter = await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, sources, deps.quarters);
  if (!resolvedQuarter) return { status: 'no_quarter', tradeDate };
  const rocYear = Number(resolvedQuarter.year);
  const season = Number(resolvedQuarter.season);

  const key = { symbol, year: rocYear, quarter: season, dataType, subsidiaryCompanyId };
  const [balanceSheet, incomeStatement] = await Promise.all([deps.statements.getBalanceSheet(key), deps.statements.getIncomeStatement(key)]);
  const reportDate = balanceSheet?.reportDate ?? incomeStatement?.reportDate ?? null;

  let ttmSum = 0n;
  let ttmComplete = sources.includes('incomeStatement');
  if (ttmComplete) {
    const ttmRecords = await Promise.all(
      getPastNQuarters({ rocYear, season: String(season) as Season }, 4).map((tq) =>
        deps.statements.getIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId })
      )
    );
    for (const record of ttmRecords) {
      const picked = pickNetIncome(record);
      if (picked.value === null) ttmComplete = false;
      else ttmSum += picked.value;
    }
  }

  const shares = reportDate ? await deps.shares.getOutstandingCommonShares(symbol, reportDate) : null;
  if (!shares || !reportDate) return { status: 'ok', tradeDate, close, rocYear, season, epsTtm: null, bvps: null, ttmComplete };

  const basis = await deps.shares.getShareBasisEvents(symbol, reportDate, tradeDate);
  const sharesAtBasis = Number(shares.outstandingCommonShares) * basis.basisMultiplier;
  // 普通股口徑：權益扣特別股股本、淨利扣特別股股利（見 domain/financials/outstandingCommonShares.ts）；三大表金額是千元。
  const commonEquity = toCommonEquity(pickEquity(balanceSheet).value, shares.preferredCapitalThousands);
  const rolled = rollForwardPerShare(
    {
      shares: sharesAtBasis,
      bvps: commonEquity !== null ? (Number(commonEquity) * 1000) / sharesAtBasis : null,
      eps: ttmComplete ? (Number(ttmSum - shares.preferredDividendsTtmThousands) * 1000) / sharesAtBasis : null,
    },
    basis.events,
    tradeDate
  );
  return { status: 'ok', tradeDate, close, rocYear, season, epsTtm: rolled.eps, bvps: rolled.bvps, ttmComplete };
};
