import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getBalanceSheetXbrlFirst as getQuarterlyBalanceSheet } from '@/shared/sourceData/balanceSheetXbrlFirst';
import { getIncomeStatementXbrlFirst as getQuarterlyIncomeStatement, type IncomeStatementFields } from '@/shared/sourceData/incomeStatementXbrlFirst';
import { getMarketCapAsOf } from '@/shared/sourceData/marketCap';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, type MetricValueWriteOutcome, periodTypeGroup } from '../../metricValueWriter';
import type { MetricNullReason } from '../../metricBasis';

// Greenblatt 盈餘收益率 = EBIT(TTM) / EV * 100。EV = 市值 + 有息負債(本季期末) - 現金及約當
// 現金(本季期末)——跟 netDebtToEbitda 的「有息負債」定義同一組欄位
// （shortTermBorrowings+bondsPayable+longTermBorrowings）。市值查詢複用 getMarketCapAsOf，
// 跟 marketCap/altmanZScore(X4)/tobinsQ 同一套模式。只有 TTM 一種 basis。

const toPct2 = (numerator: number, denominator: number): number | null => {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 100 * 100) / 100;
};

export interface GreenblattEarningsYieldTtmQuarterDetail {
  rocYear: number;
  season: number;
  fiscalYear: number;
  profitBeforeTax: bigint | null;
  financeCosts: bigint | null;
  reportDate: Date | null;
}

export interface GreenblattEarningsYieldResolution {
  symbol: string;
  rocYear: string;
  season: string;
  fiscalYear: number;
  fiscalQuarter: number;
  totalDebt: bigint | null;
  cashAndEquivalents: bigint | null;
  ttmQuarterDetails: GreenblattEarningsYieldTtmQuarterDetail[];
  ttmComplete: boolean;
  earningsYieldTtm: number | null;
  ttmNullReason: MetricNullReason | null;
  mainAnchor: Awaited<ReturnType<typeof resolveKnowledgeDate>>;
}

export const resolveGreenblattEarningsYieldInputs = async (query: QuarterlyMetricQuery): Promise<GreenblattEarningsYieldResolution | null> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['balanceSheet', 'incomeStatement']);

  if (!resolvedQuarter) return null;

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const balanceSheet = await getQuarterlyBalanceSheet(key);
  const totalDebt =
    balanceSheet !== null ? (balanceSheet.shortTermBorrowings ?? 0n) + (balanceSheet.bondsPayable ?? 0n) + (balanceSheet.longTermBorrowings ?? 0n) : null;
  const cashAndEquivalents = balanceSheet?.cashAndEquivalents ?? null;
  const reportDate = balanceSheet?.reportDate ?? null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);
  const marketCapAsOf = mainAnchor ? await getMarketCapAsOf(symbol, mainAnchor.knowledgeDate) : null;
  const marketCap = marketCapAsOf?.marketCap ?? null;

  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords: (IncomeStatementFields | null)[] = await Promise.all(
    ttmQuarters.map((tq) => getQuarterlyIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );

  const ttmQuarterDetails: GreenblattEarningsYieldTtmQuarterDetail[] = ttmQuarters.map((tq, i) => ({
    rocYear: Number(tq.year),
    season: Number(tq.season),
    fiscalYear: rocYearToGregorian(Number(tq.year)),
    profitBeforeTax: ttmRecords[i]?.profitBeforeTax ?? null,
    financeCosts: ttmRecords[i]?.financeCosts ?? null,
    reportDate: ttmRecords[i]?.reportDate ?? null,
  }));

  let ebitTtmSum = 0n;
  let ttmComplete = true;
  for (const detail of ttmQuarterDetails) {
    if (detail.profitBeforeTax === null || detail.financeCosts === null) {
      ttmComplete = false;
    } else {
      ebitTtmSum += detail.profitBeforeTax + detail.financeCosts;
    }
  }

  const ev = marketCap !== null && totalDebt !== null && cashAndEquivalents !== null ? marketCap + Number(totalDebt) * 1000 - Number(cashAndEquivalents) * 1000 : null;
  const earningsYieldTtm = ttmComplete && ev !== null ? toPct2(Number(ebitTtmSum) * 1000, ev) : null;

  let ttmNullReason: MetricNullReason | null = null;
  if (earningsYieldTtm === null) {
    ttmNullReason = !ttmComplete ? 'insufficient_history' : ev === null ? 'missing_input' : 'zero_or_negative_denominator';
  }

  return { symbol, rocYear: year, season, fiscalYear, fiscalQuarter: seasonNum, totalDebt, cashAndEquivalents, ttmQuarterDetails, ttmComplete, earningsYieldTtm, ttmNullReason, mainAnchor };
};

type BasisOutcome = MetricValueWriteOutcome | { action: 'skipped_no_knowledge_date' } | { action: 'skipped_no_quarter' };

export interface GreenblattEarningsYieldPitOutcome {
  symbol: string;
  rocYear: string | null;
  season: string | null;
  ttm: BasisOutcome;
}

export const computeAndWriteGreenblattEarningsYieldPit = async (query: QuarterlyMetricQuery): Promise<GreenblattEarningsYieldPitOutcome> => {
  const resolution = await resolveGreenblattEarningsYieldInputs(query);
  if (!resolution) {
    return { symbol: query.symbol, rocYear: null, season: null, ttm: { action: 'skipped_no_quarter' } };
  }

  const { symbol, rocYear, season, fiscalYear, fiscalQuarter, ttmComplete, ttmQuarterDetails, earningsYieldTtm, ttmNullReason, mainAnchor } = resolution;
  const coordinateBase = { symbol, metricCode: 'greenblattEarningsYield', fiscalYear, fiscalQuarter, dataType: query.dataType, subsidiaryCompanyId: query.subsidiaryCompanyId };

  let ttm: BasisOutcome;
  if (!mainAnchor) {
    ttm = { action: 'skipped_no_knowledge_date' };
  } else if (ttmComplete) {
    const ttmAnchor = await resolveKnowledgeDate(
      symbol,
      ttmQuarterDetails.map((detail) => ({ rocYear: detail.rocYear, season: detail.season, reportDate: detail.reportDate }))
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
  } else {
    ttm = await writeMetricValue({
      ...coordinateBase,
      ...periodTypeGroup('TTM'),
      value: null,
      nullReason: 'insufficient_history',
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  }

  return { symbol, rocYear, season, ttm };
};
