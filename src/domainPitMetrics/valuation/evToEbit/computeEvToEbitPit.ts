import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getBalanceSheetXbrlFirst as getQuarterlyBalanceSheet } from '@/shared/sourceData/balanceSheetXbrlFirst';
import { getIncomeStatementXbrlFirst as getQuarterlyIncomeStatement } from '@/shared/sourceData/incomeStatementXbrlFirst';
import { getMarketCapAsOf } from '@/shared/sourceData/marketCap';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, type MetricValueWriteOutcome, periodTypeGroup } from '../../metricValueWriter';
import type { MetricNullReason } from '../../metricBasis';

// 量化選股盤點使用者要求新增（Acquirer's Multiple）。跟 evEbitda 幾乎同一套邏輯，差別只在
// EBIT 不加回折舊攤銷（不需要查現金流量表），公式獨立重新計算，不依賴 evEbitda 已寫入的值。

const toMultipleFromThousands = (numerator: number, amountInThousands: bigint): number | null => {
  const denominator = Number(amountInThousands) * 1000;
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 100) / 100;
};

type BasisOutcome = MetricValueWriteOutcome | { action: 'skipped_no_knowledge_date' } | { action: 'skipped_no_quarter' };

export interface EvToEbitPitOutcome {
  symbol: string;
  rocYear: string | null;
  season: string | null;
  qAnn: BasisOutcome;
  ttm: BasisOutcome;
}

export const computeAndWriteEvToEbitPit = async (query: QuarterlyMetricQuery): Promise<EvToEbitPitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['balanceSheet', 'incomeStatement']);

  if (!resolvedQuarter) {
    return { symbol, rocYear: null, season: null, qAnn: { action: 'skipped_no_quarter' }, ttm: { action: 'skipped_no_quarter' } };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const [balanceSheet, incomeStatement] = await Promise.all([getQuarterlyBalanceSheet(key), getQuarterlyIncomeStatement(key)]);

  const totalDebt = balanceSheet
    ? (balanceSheet.shortTermBorrowings ?? 0n) + (balanceSheet.bondsPayable ?? 0n) + (balanceSheet.longTermBorrowings ?? 0n)
    : null;
  const cashAndEquivalents = balanceSheet?.cashAndEquivalents ?? null;
  const netDebt = totalDebt !== null && cashAndEquivalents !== null ? totalDebt - cashAndEquivalents : null;

  const profitBeforeTax = incomeStatement?.profitBeforeTax ?? null;
  const financeCosts = incomeStatement?.financeCosts ?? null;
  const ebitQuarterly = profitBeforeTax !== null && financeCosts !== null ? profitBeforeTax + financeCosts : null;

  const reportDate = balanceSheet?.reportDate ?? incomeStatement?.reportDate ?? null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);
  const marketCap = mainAnchor ? await getMarketCapAsOf(symbol, mainAnchor.knowledgeDate) : null;
  const enterpriseValue = marketCap !== null && netDebt !== null ? marketCap.marketCap + Number(netDebt) * 1000 : null;

  const qAnnValue = enterpriseValue !== null && ebitQuarterly !== null ? toMultipleFromThousands(enterpriseValue, ebitQuarterly * 4n) : null;
  const qAnnNullReason: MetricNullReason | null =
    qAnnValue === null ? (enterpriseValue === null || ebitQuarterly === null ? 'missing_input' : 'zero_or_negative_denominator') : null;

  const coordinateBase = { symbol, metricCode: 'evToEbit', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  let qAnn: BasisOutcome;
  if (!mainAnchor) {
    qAnn = { action: 'skipped_no_knowledge_date' };
  } else {
    qAnn = await writeMetricValue({
      ...coordinateBase,
      ...periodTypeGroup('Q_ANN'),
      value: qAnnValue,
      nullReason: qAnnNullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  }

  // TTM：近四季（含本季）EBIT 加總；企業價值沿用上面同一筆，不另外重查。
  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => getQuarterlyIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );

  let ebitTtmSum = 0n;
  let ttmComplete = true;
  for (const record of ttmRecords) {
    if (record === null || record.profitBeforeTax === null || record.financeCosts === null) {
      ttmComplete = false;
    } else {
      ebitTtmSum += record.profitBeforeTax + record.financeCosts;
    }
  }

  const ttmValue = ttmComplete && enterpriseValue !== null ? toMultipleFromThousands(enterpriseValue, ebitTtmSum) : null;
  const ttmNullReason: MetricNullReason | null = ttmValue !== null ? null : ttmComplete ? (enterpriseValue === null ? 'missing_input' : 'zero_or_negative_denominator') : 'insufficient_history';

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
        value: ttmValue,
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

  return { symbol, rocYear: year, season, qAnn, ttm };
};
