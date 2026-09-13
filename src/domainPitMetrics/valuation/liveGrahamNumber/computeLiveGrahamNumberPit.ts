import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { pickEquity, pickNetIncome } from '@/domainPitMetrics/shared/pickers';
import { getBalanceSheetXbrlFirst as getQuarterlyBalanceSheet } from '@/shared/sourceData/balanceSheetXbrlFirst';
import { getIncomeStatementXbrlFirst as getQuarterlyIncomeStatement } from '@/shared/sourceData/incomeStatementXbrlFirst';
import { getPaidInSharesAsOf } from '@/shared/sourceData/capitalStock';
import { getLatestDailyPrice } from '@/shared/sourceData/twseMarketData';
import { getPastNQuarters, type Season } from '@/shared/rocQuarter';
import { resolveDailyCadenceKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, type MetricValueWriteOutcome, snapshotCadenceGroup } from '../../metricValueWriter';
import type { MetricNullReason } from '../../metricBasis';

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

const toPerShare = (numeratorInThousands: bigint, shares: bigint): number | null => {
  if (shares === 0n) return null;
  return Math.round(((Number(numeratorInThousands) * 1000) / Number(shares)) * 100) / 100;
};

const toRatioFromNumbers = (numerator: number, denominator: number): number | null => {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 100) / 100;
};

export interface LiveGrahamNumberPitQuery {
  symbol: string;
  dataType: '1' | '2';
  subsidiaryCompanyId: string;
}

type LiveOutcome = MetricValueWriteOutcome | { action: 'skipped_no_trade_date' } | { action: 'skipped_no_quarter' };

export interface LiveGrahamNumberPitOutcome {
  symbol: string;
  tradeDate: string | null;
  eod: LiveOutcome;
}

export const computeAndWriteLiveGrahamNumberPit = async (query: LiveGrahamNumberPitQuery): Promise<LiveGrahamNumberPitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const latestPrice = await getLatestDailyPrice(symbol);
  if (!latestPrice || latestPrice.close === null) {
    return { symbol, tradeDate: null, eod: { action: 'skipped_no_trade_date' } };
  }
  const { tradeDate, close } = latestPrice;

  const resolvedQuarter = await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['balanceSheet', 'incomeStatement']);
  if (!resolvedQuarter) {
    return { symbol, tradeDate: tradeDate.toISOString().slice(0, 10), eod: { action: 'skipped_no_quarter' } };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const [balanceSheet, incomeStatement] = await Promise.all([getQuarterlyBalanceSheet(key), getQuarterlyIncomeStatement(key)]);
  const equity = pickEquity(balanceSheet);
  const reportDate = balanceSheet?.reportDate ?? incomeStatement?.reportDate ?? null;

  const shares = reportDate ? await getPaidInSharesAsOf(symbol, reportDate) : null;
  const sharesValue = shares?.paidInShares ?? null;

  const bvps = equity.value !== null && sharesValue !== null ? toPerShare(equity.value, sharesValue) : null;
  const pbRatio = bvps !== null ? toRatioFromNumbers(close, bvps) : null;

  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => getQuarterlyIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );

  let netIncomeTtmSum = 0n;
  let ttmComplete = true;
  for (const record of ttmRecords) {
    const picked = pickNetIncome(record);
    if (picked.value === null) {
      ttmComplete = false;
    } else {
      netIncomeTtmSum += picked.value;
    }
  }

  const epsTtm = ttmComplete && sharesValue !== null ? toPerShare(netIncomeTtmSum, sharesValue) : null;
  const peRatioTtm = epsTtm !== null ? toRatioFromNumbers(close, epsTtm) : null;

  const liveGrahamNumber = peRatioTtm !== null && pbRatio !== null ? Math.round(peRatioTtm * pbRatio * 100) / 100 : null;

  let nullReason: MetricNullReason | null = null;
  if (liveGrahamNumber === null) {
    if (!ttmComplete) nullReason = 'insufficient_history';
    else if (epsTtm === null || bvps === null) nullReason = 'missing_input';
    else nullReason = 'zero_or_negative_denominator';
  }

  const { knowledgeDate } = resolveDailyCadenceKnowledgeDate(tradeDate);

  const eod = await writeMetricValue({
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

  return { symbol, tradeDate: tradeDate.toISOString().slice(0, 10), eod };
};
