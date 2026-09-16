import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import type { IncomeStatementFields } from '@/application/ports/financialStatements';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { computation, type ComputationBatch, type ComputationSlot, noQuarterBatch } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';

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
  marketCap: number | null;
  totalDebt: bigint | null;
  cashAndEquivalents: bigint | null;
  ttmQuarterDetails: GreenblattEarningsYieldTtmQuarterDetail[];
  ttmComplete: boolean;
  earningsYieldTtm: number | null;
  ttmNullReason: MetricNullReason | null;
  mainAnchor: Awaited<ReturnType<typeof resolveKnowledgeDate>>;
}

export const resolveGreenblattEarningsYieldInputs = async (
  query: QuarterlyMetricQuery,
  deps: GreenblattEarningsYieldDeps
): Promise<GreenblattEarningsYieldResolution | null> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet', 'incomeStatement'], deps.quarters);

  if (!resolvedQuarter) return null;

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const balanceSheet = await deps.statements.getBalanceSheet(key);
  const totalDebt =
    balanceSheet !== null ? (balanceSheet.shortTermBorrowings ?? 0n) + (balanceSheet.bondsPayable ?? 0n) + (balanceSheet.longTermBorrowings ?? 0n) : null;
  const cashAndEquivalents = balanceSheet?.cashAndEquivalents ?? null;
  const reportDate = balanceSheet?.reportDate ?? null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);
  const marketCapAsOf = mainAnchor ? await deps.market.getMarketCap(symbol, mainAnchor.knowledgeDate) : null;
  const marketCap = marketCapAsOf?.marketCap ?? null;

  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords: (IncomeStatementFields | null)[] = await Promise.all(
    ttmQuarters.map((tq) => deps.statements.getIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
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

  return { symbol, rocYear: year, season, fiscalYear, fiscalQuarter: seasonNum, marketCap, totalDebt, cashAndEquivalents, ttmQuarterDetails, ttmComplete, earningsYieldTtm, ttmNullReason, mainAnchor };
};


export type GreenblattEarningsYieldDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'market'>;

export type GreenblattEarningsYieldComputationBatch = ComputationBatch<'ttm'>;

export const computeGreenblattEarningsYield = async (
  query: QuarterlyMetricQuery,
  deps: GreenblattEarningsYieldDeps
): Promise<GreenblattEarningsYieldComputationBatch> => {
  const resolution = await resolveGreenblattEarningsYieldInputs(query, deps);
  if (!resolution) {
    return noQuarterBatch(query.symbol, ['ttm']);
  }

  const { symbol, rocYear, season, fiscalYear, fiscalQuarter, ttmComplete, ttmQuarterDetails, earningsYieldTtm, ttmNullReason, mainAnchor } = resolution;
  const coordinateBase = { symbol, metricCode: 'greenblattEarningsYield', fiscalYear, fiscalQuarter, dataType: query.dataType, subsidiaryCompanyId: query.subsidiaryCompanyId };

  let ttm: ComputationSlot;
  if (!mainAnchor) {
    ttm = { action: 'skipped_no_knowledge_date' };
  } else if (ttmComplete) {
    const ttmAnchor = await resolveKnowledgeDate(
      symbol,
      ttmQuarterDetails.map((detail) => ({ rocYear: detail.rocYear, season: detail.season, reportDate: detail.reportDate })), deps.announcements
    );
    if (!ttmAnchor) {
      ttm = { action: 'skipped_no_knowledge_date' };
    } else {
      ttm = computation({
        ...coordinateBase,
        ...periodTypeGroup('TTM'),
        value: earningsYieldTtm,
        nullReason: ttmNullReason,
        knowledgeDate: ttmAnchor.knowledgeDate,
        knowledgeDateIsFallback: ttmAnchor.isFallback,
      });
    }
  } else {
    ttm = computation({
      ...coordinateBase,
      ...periodTypeGroup('TTM'),
      value: null,
      nullReason: 'insufficient_history',
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  }

  return { symbol, rocYear, season, slots: { ttm } };
};
