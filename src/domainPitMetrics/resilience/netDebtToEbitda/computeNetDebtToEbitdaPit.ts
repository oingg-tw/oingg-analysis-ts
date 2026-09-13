import { resolveQuarterOrLatest } from '@/shared/sourceData/latestQuarter';
import { determineNullReason } from '@/domainPitMetrics/shared/numericHelpers';
import { financialDataAdapter, type BalanceSheetPort, type IncomeStatementPort, type CashFlowStatementPort } from '@/domainPitMetrics/shared/ports/financialDataPorts';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, periodTypeGroup } from '../../metricValueWriter';
import type { BasisOutcome, StandardBasisPitOutcome } from '../../pitOutcome';
import type { MetricNullReason } from '../../metricBasis';

// 這份檔案是 src/domainMetrics/netDebtToEbitda.ts 的獨立重新實作。只有 Q_ANN/TTM 兩種
// basis——跟舊架構一致，taxonomy 只支援這兩種（store/flow 比率），沒有單季非年化版本。
// EBIT = 稅前淨利+利息費用，這個公式在 interestCoverage/netDebtToEbitda/roic/roce 四個
// 舊架構檔案各自重複定義，這裡延續同一個既有慣例，evEbitda 這批也會再重複一次淨負債+
// EBITDA 的計算，不依賴這個 metric_code 已寫入的值。

export type NetDebtToEbitdaPitOutcome = StandardBasisPitOutcome;

export const computeAndWriteNetDebtToEbitdaPit = async (query: QuarterlyMetricQuery, statements: BalanceSheetPort & IncomeStatementPort & CashFlowStatementPort = financialDataAdapter): Promise<NetDebtToEbitdaPitOutcome> => {
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

  const qAnnValue = netDebt !== null && ebitdaQuarterly !== null && ebitdaQuarterly !== 0n ? Math.round((Number(netDebt) / (Number(ebitdaQuarterly) * 4)) * 100) / 100 : null;
  const qAnnNullReason: MetricNullReason | null = qAnnValue === null ? determineNullReason(netDebt, ebitdaQuarterly) : null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);
  const coordinateBase = { symbol, metricCode: 'netDebtToEbitda', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

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

  // TTM：近四季（含本季）EBITDA 加總，淨負債固定用本季期末值（不平均不加總）。
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

  const ttmValue = ttmComplete && netDebt !== null && ebitdaTtmSum !== 0n ? Math.round((Number(netDebt) / Number(ebitdaTtmSum)) * 100) / 100 : null;
  const ttmNullReason: MetricNullReason | null = ttmValue !== null ? null : ttmComplete ? determineNullReason(netDebt, ebitdaTtmSum) : 'insufficient_history';

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
