import { resolveQuarterOrLatest } from '@/shared/sourceData/latestQuarter';
import { financialDataAdapter, type BalanceSheetPort, type IncomeStatementPort, type CashFlowStatementPort, type MarketCapPort } from '@/domainPitMetrics/shared/ports/financialDataPorts';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, periodTypeGroup } from '../../metricValueWriter';
import type { BasisOutcome, StandardBasisPitOutcome } from '../../pitOutcome';
import type { MetricNullReason } from '../../metricBasis';

// 這份檔案是 src/domainMetrics/evEbitda.ts 的獨立重新實作——舊架構呼叫
// calculateNetDebtToEbitda()，這裡不依賴 netDebtToEbitda 這個 metric_code 已寫入的值，
// 自己重新查三張表算淨負債+EBITDA（公式在 computeNetDebtToEbitdaPit.ts 跟這裡各自重複一次，
// 延續舊架構本身在 interestCoverage/netDebtToEbitda/roic/roce 四個檔案各自重複定義 EBIT
// 的既有慣例）。市值查詢邏輯跟 psr/pFcf 一致。沒有單季非年化版本。

const toMultipleFromThousands = (numerator: number, amountInThousands: bigint): number | null => {
  const denominator = Number(amountInThousands) * 1000;
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 100) / 100;
};

export type EvEbitdaPitOutcome = StandardBasisPitOutcome;

export const computeAndWriteEvEbitdaPit = async (
  query: QuarterlyMetricQuery,
  statements: BalanceSheetPort & IncomeStatementPort & CashFlowStatementPort & MarketCapPort = financialDataAdapter
): Promise<EvEbitdaPitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet', 'incomeStatement', 'cashFlowStatement']);

  if (!resolvedQuarter) {
    return { symbol, rocYear: null, season: null, qAnn: { action: 'skipped_no_quarter' }, ttm: { action: 'skipped_no_quarter' } };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const [balanceSheet, incomeStatement, cashFlowStatement] = await Promise.all([
    statements.getBalanceSheet(key),
    statements.getIncomeStatement(key),
    statements.getCashFlowStatement(key),
  ]);

  const totalDebt = balanceSheet
    ? (balanceSheet.shortTermBorrowings ?? 0n) + (balanceSheet.bondsPayable ?? 0n) + (balanceSheet.longTermBorrowings ?? 0n)
    : null;
  const cashAndEquivalents = balanceSheet?.cashAndEquivalents ?? null;
  const netDebt = totalDebt !== null && cashAndEquivalents !== null ? totalDebt - cashAndEquivalents : null;

  const profitBeforeTax = incomeStatement?.profitBeforeTax ?? null;
  const financeCosts = incomeStatement?.financeCosts ?? null;
  const depreciation = cashFlowStatement?.depreciation ?? null;
  const amortization = cashFlowStatement?.amortization ?? null;
  const ebitdaQuarterly =
    profitBeforeTax !== null && financeCosts !== null && depreciation !== null && amortization !== null
      ? profitBeforeTax + financeCosts + depreciation + amortization
      : null;

  const reportDate = balanceSheet?.reportDate ?? incomeStatement?.reportDate ?? cashFlowStatement?.reportDate ?? null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);
  const marketCap = mainAnchor ? await statements.getMarketCap(symbol, mainAnchor.knowledgeDate) : null;
  const enterpriseValue = marketCap !== null && netDebt !== null ? marketCap.marketCap + Number(netDebt) * 1000 : null;

  const qAnnValue = enterpriseValue !== null && ebitdaQuarterly !== null ? toMultipleFromThousands(enterpriseValue, ebitdaQuarterly * 4n) : null;
  const qAnnNullReason: MetricNullReason | null =
    qAnnValue === null ? (enterpriseValue === null || ebitdaQuarterly === null ? 'missing_input' : 'zero_or_negative_denominator') : null;

  const coordinateBase = { symbol, metricCode: 'evEbitda', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

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

  // TTM：近四季（含本季）EBITDA 加總；企業價值（市值+淨負債）沿用上面同一筆，不另外重查。
  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) =>
      Promise.all([
        statements.getIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }),
        statements.getCashFlowStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }),
      ])
    )
  );

  let ebitdaTtmSum = 0n;
  let ttmComplete = true;
  for (const [incomeRecord, cashFlowRecord] of ttmRecords) {
    if (
      incomeRecord === null ||
      cashFlowRecord === null ||
      incomeRecord.profitBeforeTax === null ||
      incomeRecord.financeCosts === null ||
      cashFlowRecord.depreciation === null ||
      cashFlowRecord.amortization === null
    ) {
      ttmComplete = false;
    } else {
      ebitdaTtmSum += incomeRecord.profitBeforeTax + incomeRecord.financeCosts + cashFlowRecord.depreciation + cashFlowRecord.amortization;
    }
  }

  const ttmValue = ttmComplete && enterpriseValue !== null ? toMultipleFromThousands(enterpriseValue, ebitdaTtmSum) : null;
  const ttmNullReason: MetricNullReason | null = ttmValue !== null ? null : ttmComplete ? (enterpriseValue === null ? 'missing_input' : 'zero_or_negative_denominator') : 'insufficient_history';

  let ttm: BasisOutcome;
  if (ttmComplete) {
    const ttmAnchor = await resolveKnowledgeDate(
      symbol,
      ttmQuarters.map((tq, i) => ({ rocYear: Number(tq.year), season: Number(tq.season), reportDate: ttmRecords[i]![0]?.reportDate ?? null }))
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
