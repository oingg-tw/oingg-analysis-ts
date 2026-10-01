import { getLatestAvailableQuarter } from '@/application/financials/latestQuarter';
import { toCommonEquity } from '@/domain/financials/outstandingCommonShares';
import { rollForwardPerShare } from '@/domain/financials/liveShareBasis';
import { pickEquityWithFieldKey, pickNetIncomeWithFieldKey, type PickedField } from '@/domain/metrics/shared/pickers';
import { getPastNQuarters, type Season } from '@/domain/calendar/rocQuarter';
import type { PitDeps } from '@/application/metrics/deps';
import type { OutstandingCommonSharesAsOf, ShareBasisEventsAsOf } from '@/application/ports/capitalStock';

// 2026-09-27 即時指標共用的「跟當天股價同一基準」的每股淨值與 EPS（TTM）（使用者：「希望我們網站的數據不要跟交易所一樣慢」）。
// 從最新已申報那一季的普通股權益、近四季淨利、季末流通股數出發，套用季末之後到交易日的除息、除權、面額換發、減資恢復交易、
// 增資（見 domain/financials/liveShareBasis.ts）。livePeRatio／livePbRatio／liveGrahamNumber／livePegRatio 都從這裡取，
// 原本各支自己用「最新收盤價 ÷ 季末每股數字」，面額變更、配股後基準對不上（5904 換發後會差 10 倍）。
const MAX_BASIS_AGE_DAYS = 200;

export type LivePerShareDeps = Pick<PitDeps, 'statements' | 'quarters' | 'shares' | 'market'>;

export interface LivePerShareQuery {
  symbol: string;
  dataType: '1' | '2';
  subsidiaryCompanyId: string;
}

// 2026-10-01 溯源表（live* 的 getXxxProvenance）要列出算每股數字用到的原始輸入——跟計算同一次查詢帶出來，溯源表不另外重查、
// 不會跟寫入的值用到不同批資料。金額千元；netIncomeTtm 只在 sources 含 incomeStatement 時有（由舊到新四季）。
interface LivePerShareInputs {
  reportDate: Date | null;
  equity: PickedField;
  netIncomeTtm: { rocYear: number; season: number; picked: PickedField }[];
  shares: OutstandingCommonSharesAsOf | null;
  basis: ShareBasisEventsAsOf | null;
  baseBvps: number | null; // 季末股數基準（× basisMultiplier）下、套用事件前的每股淨值
  baseEps: number | null;
}

export type LivePerShare =
  | { status: 'no_trade_date' }
  | { status: 'no_quarter'; tradeDate: Date }
  | { status: 'ok'; tradeDate: Date; close: number; rocYear: number; season: number; epsTtm: number | null; bvps: number | null; ttmComplete: boolean; inputs: LivePerShareInputs };

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
  const netIncomeTtm: LivePerShareInputs['netIncomeTtm'] = [];
  if (ttmComplete) {
    const ttmQuarters = getPastNQuarters({ rocYear, season: String(season) as Season }, 4);
    const ttmRecords = await Promise.all(
      ttmQuarters.map((tq) => deps.statements.getIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
    );
    ttmRecords.forEach((record, i) => {
      const picked = pickNetIncomeWithFieldKey(record);
      netIncomeTtm.push({ rocYear: Number(ttmQuarters[i]!.year), season: Number(ttmQuarters[i]!.season), picked });
      if (picked.value === null) ttmComplete = false;
      else ttmSum += picked.value;
    });
  }
  const equity = pickEquityWithFieldKey(balanceSheet);

  // 最新一季財報季末離交易日超過 200 天（正常最多落後一份：3/30 還只有前一年第三季 ≈ 181 天）就不算——2941、4126 的合併報表停在
  // 111Q4，從 2022 年的每股淨值往後扣三年股利、卻沒有這三年的獲利，算出來的數字比交易所還離譜。回 null（missing_input），個股頁退回交易所值。
  const stale = !reportDate || (tradeDate.getTime() - reportDate.getTime()) / 86_400_000 > MAX_BASIS_AGE_DAYS;
  const shares = reportDate && !stale ? await deps.shares.getOutstandingCommonShares(symbol, reportDate) : null;
  if (!shares || !reportDate) {
    const inputs: LivePerShareInputs = { reportDate, equity, netIncomeTtm, shares, basis: null, baseBvps: null, baseEps: null };
    return { status: 'ok', tradeDate, close, rocYear, season, epsTtm: null, bvps: null, ttmComplete, inputs };
  }

  const basis = await deps.shares.getShareBasisEvents(symbol, reportDate, tradeDate);
  const sharesAtBasis = Number(shares.outstandingCommonShares) * basis.basisMultiplier;
  // 普通股口徑：權益扣特別股股本、淨利扣特別股股利（見 domain/financials/outstandingCommonShares.ts）；三大表金額是千元。
  const commonEquity = toCommonEquity(equity.value, shares.preferredClaimThousands);
  const baseBvps = commonEquity !== null ? (Number(commonEquity) * 1000) / sharesAtBasis : null;
  const baseEps = ttmComplete ? (Number(ttmSum - shares.preferredDividendsTtmThousands) * 1000) / sharesAtBasis : null;
  const rolled = rollForwardPerShare({ shares: sharesAtBasis, bvps: baseBvps, eps: baseEps }, basis.events, tradeDate);
  const inputs: LivePerShareInputs = { reportDate, equity, netIncomeTtm, shares, basis, baseBvps, baseEps };
  return { status: 'ok', tradeDate, close, rocYear, season, epsTtm: rolled.eps, bvps: rolled.bvps, ttmComplete, inputs };
};
