import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { toPerShare } from '@/domain/metrics/shared/numericHelpers';
import { pickNetIncome } from '@/domain/metrics/shared/pickers';
import { financialDataAdapter, type IncomeStatementPort, type PaidInSharesPort, type StockPricePort } from '@/application/metrics/shared/ports/financialDataPorts';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, periodTypeGroup } from '../../metricValueWriter';
import type { BasisOutcome, StandardBasisPitOutcome } from '../../pitOutcome';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';

// 盈餘收益率（EY）= EPS(TTM) / 股價 * 100，是本益比的倒數換算成百分比呈現——獨立重新計算
// EPS_TTM/股價（不依賴 eps/peRatio 這兩個 metric_code 已寫入的值，跟 sgr 對 roe/
// dividendPayoutRatio 的既有做法一致），公式/資料源直接複製自 peRatio 的既有邏輯。
// 跟 peRatio 不同：peRatio 分母為 0 才是 null，這裡分母（股價）不太可能是 0，反而要留意
// 股價缺漏；EPS_TTM 為負時 EY 一樣算出真實但為負的值，不隱藏成 null（跟 peRatio 虧損時
// 本益比為負同一個判斷）。

export type EarningsYieldPitOutcome = StandardBasisPitOutcome;

export const computeAndWriteEarningsYieldPit = async (
  query: QuarterlyMetricQuery,
  statements: IncomeStatementPort & PaidInSharesPort & StockPricePort = financialDataAdapter
): Promise<EarningsYieldPitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement']);

  if (!resolvedQuarter) {
    return { symbol, rocYear: null, season: null, ttm: { action: 'skipped_no_quarter' } };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const incomeStatement = await statements.getIncomeStatement(key);
  const reportDate = incomeStatement?.reportDate ?? null;

  const shares = reportDate ? await statements.getPaidInShares(symbol, reportDate) : null;
  const sharesValue = shares?.paidInShares ?? null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);
  const stockPrice = mainAnchor ? await statements.getStockPrice(symbol, mainAnchor.knowledgeDate) : null;

  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => statements.getIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
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
  const earningsYieldTtm =
    epsTtm !== null && stockPrice !== null && stockPrice.closePrice !== 0 ? Math.round((epsTtm / stockPrice.closePrice) * 100 * 100) / 100 : null;

  let ttmNullReason: MetricNullReason | null = null;
  if (earningsYieldTtm === null) {
    if (!ttmComplete) ttmNullReason = 'insufficient_history';
    else if (epsTtm === null || stockPrice === null) ttmNullReason = 'missing_input';
    else ttmNullReason = 'zero_or_negative_denominator';
  }

  const coordinateBase = { symbol, metricCode: 'earningsYield', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  let ttm: BasisOutcome;
  if (ttmComplete) {
    const ttmAnchor = await resolveKnowledgeDate(
      symbol,
      ttmQuarters.map((tq, i) => ({ rocYear: Number(tq.year), season: Number(tq.season), reportDate: ttmRecords[i]?.reportDate ?? null }))
    );
    if (!ttmAnchor) {
      ttm = { action: 'skipped_no_knowledge_date' };
    } else {
      ttm = await writeMetricValue({
        ...coordinateBase,
        ...periodTypeGroup('TTM'),
        value: earningsYieldTtm,
        nullReason: ttmNullReason,
        knowledgeDate: ttmAnchor.knowledgeDate,
        knowledgeDateIsFallback: ttmAnchor.isFallback,
      });
    }
  } else if (mainAnchor) {
    ttm = await writeMetricValue({
      ...coordinateBase,
      ...periodTypeGroup('TTM'),
      value: null,
      nullReason: 'insufficient_history',
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  } else {
    ttm = { action: 'skipped_no_knowledge_date' };
  }

  return { symbol, rocYear: year, season, ttm };
};
