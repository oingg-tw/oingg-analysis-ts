import { getLatestAvailableQuarter } from '@/models/latestQuarter';
import { toPerShare, toRatioFromNumbers } from '@/domainPitMetrics/shared/numericHelpers';
import { pickNetIncome } from '@/domainPitMetrics/shared/pickers';
import { getIncomeStatementXbrlFirst as getQuarterlyIncomeStatement } from '@/models/mops/incomeStatementXbrlFirst';
import { getPaidInSharesAsOf } from '@/models/mops/capitalStock';
import { getLatestDailyPrice } from '@/models/twseMarketData';
import { getPastNQuarters, type Season } from '@/domain/calendar/rocQuarter';
import { resolveDailyCadenceKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, type MetricValueWriteOutcome, snapshotCadenceGroup } from '../../metricValueWriter';
import type { MetricNullReason } from '../../metricBasis';

// 2026-09-11 應 web-nuxt 要求新增——pegRatio（季報快照，PER 用財報公告當天股價）的即時
// 版本：EPS 5 年 CAGR 維持用「最新已申報」的完整會計年度資料，PER 的股價改用當下最新
// 收盤價（getLatestDailyPrice），公式/nullReason 判斷邏輯完全複製自 pegRatio，只有價格
// 來源不同。跟 pegRatio 是刻意並存、互不影響的兩支獨立 metricCode，比照 exchangePeRatio
// vs peRatio 的既有先例。逐日型（snapshotCadence='EOD'），knowledgeDate = 交易日本身。

const PEG_GROWTH_YEARS = 5;

const getAnnualEps = async (
  cache: Map<number, number | null>,
  symbol: string,
  rocYear: number,
  dataType: string,
  subsidiaryCompanyId: string
): Promise<number | null> => {
  if (cache.has(rocYear)) return cache.get(rocYear)!;

  const quarters = await Promise.all(
    [1, 2, 3, 4].map((quarter) => getQuarterlyIncomeStatement({ symbol, year: rocYear, quarter, dataType, subsidiaryCompanyId }))
  );
  if (quarters.some((q) => q === null || pickNetIncome(q).value === null)) {
    cache.set(rocYear, null);
    return null;
  }

  const netIncomeSum = quarters.reduce((sum, q) => sum + pickNetIncome(q).value!, 0n);
  const q4ReportDate = quarters[3]!.reportDate;
  const shares = await getPaidInSharesAsOf(symbol, q4ReportDate);
  if (!shares) {
    cache.set(rocYear, null);
    return null;
  }

  const value = (Number(netIncomeSum) * 1000) / Number(shares.paidInShares);
  cache.set(rocYear, value);
  return value;
};

export interface LivePegRatioPitQuery {
  symbol: string;
  dataType: '1' | '2';
  subsidiaryCompanyId: string;
}

type LiveOutcome = MetricValueWriteOutcome | { action: 'skipped_no_trade_date' } | { action: 'skipped_no_quarter' };

export interface LivePegRatioPitOutcome {
  symbol: string;
  tradeDate: string | null;
  eod: LiveOutcome;
}

export const computeAndWriteLivePegRatioPit = async (query: LivePegRatioPitQuery): Promise<LivePegRatioPitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const latestPrice = await getLatestDailyPrice(symbol);
  if (!latestPrice || latestPrice.close === null) {
    return { symbol, tradeDate: null, eod: { action: 'skipped_no_trade_date' } };
  }
  const { tradeDate, close } = latestPrice;

  const resolvedQuarter = await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['incomeStatement']);
  if (!resolvedQuarter) {
    return { symbol, tradeDate: tradeDate.toISOString().slice(0, 10), eod: { action: 'skipped_no_quarter' } };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const mainIncomeStatement = await getQuarterlyIncomeStatement(key);
  const reportDate = mainIncomeStatement?.reportDate ?? null;

  const shares = reportDate ? await getPaidInSharesAsOf(symbol, reportDate) : null;
  const sharesValue = shares?.paidInShares ?? null;

  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => getQuarterlyIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
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

  const epsTtm = ttmComplete && sharesValue !== null ? toPerShare(ttmSum, sharesValue) : null;
  const peRatioTtm = epsTtm !== null ? toRatioFromNumbers(close, epsTtm) : null;

  const latestCompleteFiscalYear = seasonNum === 4 ? rocYear : rocYear - 1;
  const epsCache = new Map<number, number | null>();
  const currentAnnualEps = await getAnnualEps(epsCache, symbol, latestCompleteFiscalYear, dataType, subsidiaryCompanyId);
  const priorAnnualEps = await getAnnualEps(epsCache, symbol, latestCompleteFiscalYear - PEG_GROWTH_YEARS, dataType, subsidiaryCompanyId);

  const epsCagr5yPct =
    currentAnnualEps !== null && priorAnnualEps !== null && currentAnnualEps > 0 && priorAnnualEps > 0
      ? Math.round((Math.pow(currentAnnualEps / priorAnnualEps, 1 / PEG_GROWTH_YEARS) - 1) * 100 * 100) / 100
      : null;

  const livePegRatio = peRatioTtm !== null && epsCagr5yPct !== null && epsCagr5yPct > 0 ? Math.round((peRatioTtm / epsCagr5yPct) * 100) / 100 : null;

  let nullReason: MetricNullReason | null = null;
  if (livePegRatio === null) {
    if (!ttmComplete) nullReason = 'insufficient_history';
    else if (epsTtm === null || currentAnnualEps === null || priorAnnualEps === null) nullReason = 'missing_input';
    else nullReason = 'zero_or_negative_denominator';
  }

  const { knowledgeDate } = resolveDailyCadenceKnowledgeDate(tradeDate);

  const eod = await writeMetricValue({
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

  return { symbol, tradeDate: tradeDate.toISOString().slice(0, 10), eod };
};
