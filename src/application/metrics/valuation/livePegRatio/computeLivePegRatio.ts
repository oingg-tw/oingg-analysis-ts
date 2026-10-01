import { resolveLivePerShare } from '@/application/metrics/shared/livePerShare';
import { pickNetIncome } from '@/domain/metrics/shared/pickers';
import { resolveDailyCadenceKnowledgeDate } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { snapshotCadenceGroup } from '@/domain/metrics/coordinate';
import { computation, type DailyComputationBatch } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-22 formulaVersion 2：同 pegRatio：中繼值不四捨五入，只在最後一次（見 numericHelpers.ts toPerShareExact 的說明）。
// 2026-09-26 formulaVersion 3：流通股數改為 IAS 33 流通在外普通股（已發行 − 特別股 − 庫藏股），EPS 類分子扣特別股股利、
// 每股淨值類分子扣特別股股本；讀股數或市值的指標一起跳版，讓下游有訊號知道值變了（使用者 2026-09-26 拍板）。
// 2026-09-27 formulaVersion 4：跨期比較的每股數字做面額還原（股票分割不算每股價值變化，IAS 33 追溯調整前期；使用者：「盡可能反映內在價值的變化」）。
// 2026-09-27 formulaVersion 5：每股淨值與 EPS 換算到跟當天股價同一基準——季末之後的除息、除權、面額換發、減資恢復交易、增資都套用
// （見 application/metrics/shared/livePerShare.ts；使用者：「希望我們網站的數據不要跟交易所一樣慢，除息當天股價就變了」）。
// 2026-09-28 formulaVersion 6：跨期還原加上股票股利（配股）與股數合併式減資（使用者：「只是股數變了、公司價值沒變」的都換算，IAS 33 對配股、分割、反分割都追溯調整）。
export const LIVE_PEG_RATIO_FORMULA_VERSION = 6;

// 2026-09-11 應 web-nuxt 要求新增——pegRatio（季報快照，PER 用財報公告當天股價）的即時
// 版本：EPS 5 年 CAGR 維持用「最新已申報」的完整會計年度資料，PER 的股價改用當下最新
// 收盤價（getLatestDailyPrice），公式/nullReason 判斷邏輯完全複製自 pegRatio，只有價格
// 來源不同。跟 pegRatio 是刻意並存、互不影響的兩支獨立 metricCode，比照 exchangePeRatio
// vs peRatio 的既有先例。逐日型（snapshotCadence='EOD'），knowledgeDate = 交易日本身。

export const PEG_GROWTH_YEARS = 5;

// 面額還原：每一年的每股數字都換算到「所有已知面額變更之後」的股數基準，CAGR 比的是兩年比值，基準日選哪天都會抵銷。
// 每次呼叫才建立（模組載入時建的 Date 常數在錄製器凍結 Date 之後會被當成非 Date 編碼，cassette 對不上）。
const splitRestateBasis = (): Date => new Date(Date.UTC(9999, 0, 1));
// 溯源表（getLivePegRatioProvenance）也呼叫這支，列出的年度 EPS 就是算 CAGR 用的那兩個。
export const getAnnualEps = async (
  cache: Map<number, number | null>,
  symbol: string,
  rocYear: number,
  dataType: string,
  subsidiaryCompanyId: string, deps: LivePegRatioDeps
): Promise<number | null> => {
  if (cache.has(rocYear)) return cache.get(rocYear)!;

  const quarters = await Promise.all(
    [1, 2, 3, 4].map((quarter) => deps.statements.getIncomeStatement({ symbol, year: rocYear, quarter, dataType, subsidiaryCompanyId }))
  );
  if (quarters.some((q) => q === null || pickNetIncome(q).value === null)) {
    cache.set(rocYear, null);
    return null;
  }

  const netIncomeSum = quarters.reduce((sum, q) => sum + pickNetIncome(q).value!, 0n);
  const q4ReportDate = quarters[3]!.reportDate;
  const shares = await deps.shares.getOutstandingCommonShares(symbol, q4ReportDate);
  if (!shares) {
    cache.set(rocYear, null);
    return null;
  }

  // 2026-09-25 分子只算普通股：全年淨利扣全年特別股股利（第四季報告日的近四季＝全年），見 domain/financials/outstandingCommonShares.ts。
  const value = (Number(netIncomeSum - shares.preferredDividendsTtmThousands) * 1000) / Number(shares.outstandingCommonShares);
  const restated = value / (await deps.shares.getShareSplitFactor(symbol, q4ReportDate, splitRestateBasis()));
  cache.set(rocYear, restated);
  return restated;
};

export const latestCompleteFiscalYearOf = (rocYear: number, season: number): number => (season === 4 ? rocYear : rocYear - 1);

// PER（TTM）÷ EPS 5 年 CAGR（%），中繼值不四捨五入、最後一次取 2 位。computeLivePegRatio 跟溯源表共用。
export const calculateLivePeg = (close: number, epsTtm: number | null, currentAnnualEps: number | null, priorAnnualEps: number | null) => {
  const peRatioTtm = epsTtm !== null && epsTtm !== 0 ? close / epsTtm : null;
  const epsCagr5yPct =
    currentAnnualEps !== null && priorAnnualEps !== null && currentAnnualEps > 0 && priorAnnualEps > 0
      ? (Math.pow(currentAnnualEps / priorAnnualEps, 1 / PEG_GROWTH_YEARS) - 1) * 100
      : null;
  const value = peRatioTtm !== null && epsCagr5yPct !== null && epsCagr5yPct > 0 ? Math.round((peRatioTtm / epsCagr5yPct) * 100) / 100 : null;
  return { peRatioTtm, epsCagr5yPct, value };
};

export interface LivePegRatioPitQuery {
  symbol: string;
  dataType: '1' | '2';
  subsidiaryCompanyId: string;
}


export type LivePegRatioDeps = Pick<PitDeps, 'statements' | 'quarters' | 'shares' | 'market'>;

export type LivePegRatioComputationBatch = DailyComputationBatch<'eod'>;

export const computeLivePegRatio = async (query: LivePegRatioPitQuery, deps: LivePegRatioDeps): Promise<LivePegRatioComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const live = await resolveLivePerShare(query, ['incomeStatement'], deps);
  if (live.status === 'no_trade_date') return { symbol, tradeDate: null, slots: { eod: { action: 'skipped_no_trade_date' } } };
  if (live.status === 'no_quarter') return { symbol, tradeDate: live.tradeDate.toISOString().slice(0, 10), slots: { eod: { action: 'skipped_no_quarter' } } };
  const { tradeDate, close, epsTtm, ttmComplete } = live;
  const rocYear = live.rocYear;
  const seasonNum = live.season;
  const latestCompleteFiscalYear = latestCompleteFiscalYearOf(rocYear, seasonNum);
  const epsCache = new Map<number, number | null>();
  const currentAnnualEps = await getAnnualEps(epsCache, symbol, latestCompleteFiscalYear, dataType, subsidiaryCompanyId, deps);
  const priorAnnualEps = await getAnnualEps(epsCache, symbol, latestCompleteFiscalYear - PEG_GROWTH_YEARS, dataType, subsidiaryCompanyId, deps);

  const { value: livePegRatio } = calculateLivePeg(close, epsTtm, currentAnnualEps, priorAnnualEps);

  let nullReason: MetricNullReason | null = null;
  if (livePegRatio === null) {
    if (!ttmComplete) nullReason = 'insufficient_history';
    else if (epsTtm === null || currentAnnualEps === null || priorAnnualEps === null) nullReason = 'missing_input';
    else nullReason = 'zero_or_negative_denominator';
  }

  const { knowledgeDate } = resolveDailyCadenceKnowledgeDate(tradeDate);

  const eod = computation({
    symbol,
    metricCode: 'livePegRatio',
    ...snapshotCadenceGroup('EOD'),
    dataType,
    subsidiaryCompanyId,
    tradeDate,
    value: livePegRatio,
    nullReason,
    knowledgeDate,
    knowledgeDateIsFallback: false,
  });

  return { symbol, tradeDate: tradeDate.toISOString().slice(0, 10), slots: { eod: { ...eod, formulaVersion: LIVE_PEG_RATIO_FORMULA_VERSION } } };
};
