import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { toPercent } from '@/domainPitMetrics/shared/numericHelpers';
import { pickEquityValue as pickEquity } from '@/domainPitMetrics/shared/pickers';
import { financialDataAdapter, type IncomeStatementPort, type BalanceSheetPort } from '@/domainPitMetrics/shared/ports/financialDataPorts';

import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeOrSkip, writeMetricValue, periodTypeGroup } from '../../metricValueWriter';
import type { BasisOutcome, StandardBasisPitOutcome } from '../../pitOutcome';
import type { MetricNullReason } from '../../metricBasis';

// Fama-French (2015) RMW 因子背後的單一公司營業獲利力比率——只做分子容易單獨計算的比率
// 本身，不做完整五因子模型的橫斷面排序建構+個股迴歸（那需要全市場批次回填+迴歸引擎，
// 見 famaFrenchOperatingProfitabilityDefinition.ts 的 formulaNote）。帳面權益優先採
// 歸屬於母公司口徑，缺漏退回整體口徑，跟既有 altmanZDoublePrimeScore 同一個 pickEquity 慣例。
export type FamaFrenchOperatingProfitabilityPitOutcome = StandardBasisPitOutcome;

export const computeAndWriteFamaFrenchOperatingProfitabilityPit = async (query: QuarterlyMetricQuery, statements: IncomeStatementPort & BalanceSheetPort = financialDataAdapter): Promise<FamaFrenchOperatingProfitabilityPitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet', 'incomeStatement']);

  if (!resolvedQuarter) {
    return { symbol, rocYear: null, season: null, q: { action: 'skipped_no_quarter' }, ttm: { action: 'skipped_no_quarter' } };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const balanceSheet = await statements.getBalanceSheet(key);
  const bookEquity = pickEquity(balanceSheet);
  const incomeStatement = await statements.getIncomeStatement(key);
  const reportDate = incomeStatement?.reportDate ?? balanceSheet?.reportDate ?? null;

  const operatingProfitQuarterly =
    incomeStatement?.grossProfit !== null &&
    incomeStatement?.grossProfit !== undefined &&
    incomeStatement.sellingExpenses !== null &&
    incomeStatement.adminExpenses !== null &&
    incomeStatement.financeCosts !== null
      ? incomeStatement.grossProfit - incomeStatement.sellingExpenses - incomeStatement.adminExpenses - incomeStatement.financeCosts
      : null;

  const ratioQuarterly = operatingProfitQuarterly !== null && bookEquity !== null ? toPercent(operatingProfitQuarterly, bookEquity) : null;
  const quarterlyNullReason: MetricNullReason | null =
    ratioQuarterly !== null ? null : operatingProfitQuarterly === null || bookEquity === null ? 'missing_input' : 'zero_or_negative_denominator';

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);
  const coordinateBase = { symbol, metricCode: 'famaFrenchOperatingProfitability', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  const q = await writeOrSkip(mainAnchor, coordinateBase, 'Q', ratioQuarterly, quarterlyNullReason);

  // TTM：近四季（含本季）分子(毛利-推銷費用-管理費用-利息費用)各自加總，分母固定用本季期末帳面權益。
  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => statements.getIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );

  let operatingProfitTtmSum = 0n;
  let ttmComplete = true;
  for (const record of ttmRecords) {
    if (record === null || record.grossProfit === null || record.sellingExpenses === null || record.adminExpenses === null || record.financeCosts === null) {
      ttmComplete = false;
    } else {
      operatingProfitTtmSum += record.grossProfit - record.sellingExpenses - record.adminExpenses - record.financeCosts;
    }
  }

  const ratioTtm = ttmComplete && bookEquity !== null ? toPercent(operatingProfitTtmSum, bookEquity) : null;
  const ttmNullReason: MetricNullReason | null =
    ratioTtm !== null ? null : !ttmComplete || bookEquity === null ? 'insufficient_history' : 'zero_or_negative_denominator';

  let ttm: BasisOutcome;
  if (ttmComplete && bookEquity !== null) {
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
        value: ratioTtm,
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
      nullReason: ttmNullReason ?? 'insufficient_history',
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  } else {
    ttm = { action: 'skipped_no_knowledge_date' };
  }

  return { symbol, rocYear: year, season, q, ttm };
};
