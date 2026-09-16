import { resolveQuarterOrLatest } from '@/models/latestQuarter';
import { toPercent } from '@/domainPitMetrics/shared/numericHelpers';
import { financialDataAdapter, type IncomeStatementPort } from '@/domainPitMetrics/shared/ports/financialDataPorts';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeOrSkip, writeMetricValue, periodTypeGroup } from '../../metricValueWriter';
import type { BasisOutcome, StandardBasisPitOutcome } from '../../pitOutcome';
import type { MetricNullReason } from '../../metricBasis';

export type OperatingExpenseRatioPitOutcome = StandardBasisPitOutcome;

// 營業費用率 = 營業費用(推銷費用+管理費用) / 營收 * 100——只用 sellingExpenses+adminExpenses，
// 不含研發費用（income statement 目前沒有獨立的研發費用欄位，跟 Beneish M-Score 的 SGAI
// 概念一致，是 SG&A 水準版，不是含 R&D 的營業費用全口徑）。跟既有 grossMargin/
// operatingMargin 家族同一種 Q/TTM 設計，但這支不是家族檔案的一部分，獨立查詢——刻意不做
// 保險業替代科目 fallback（保險業損益表結構本來就沒有這個概念，跟既有 margins 家族的既有
// 決策一致，不要看到那裡有 fallback 就依樣畫葫蘆）。
export const computeAndWriteOperatingExpenseRatioPit = async (query: QuarterlyMetricQuery, statements: IncomeStatementPort = financialDataAdapter): Promise<OperatingExpenseRatioPitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement']);

  if (!resolvedQuarter) {
    return { symbol, rocYear: null, season: null, q: { action: 'skipped_no_quarter' }, ttm: { action: 'skipped_no_quarter' } };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const incomeStatement = await statements.getIncomeStatement(key);
  const reportDate = incomeStatement?.reportDate ?? null;
  const operatingExpense =
    incomeStatement?.sellingExpenses !== null && incomeStatement?.adminExpenses !== null && incomeStatement !== null
      ? incomeStatement.sellingExpenses! + incomeStatement.adminExpenses!
      : null;
  const revenue = incomeStatement?.operatingRevenue ?? null;

  const ratioQuarterly = operatingExpense !== null && revenue !== null ? toPercent(operatingExpense, revenue) : null;
  const quarterlyNullReason: MetricNullReason | null =
    ratioQuarterly !== null ? null : operatingExpense === null || revenue === null ? 'missing_input' : 'zero_or_negative_denominator';

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);
  const coordinateBase = { symbol, metricCode: 'operatingExpenseRatio', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  const q = await writeOrSkip(mainAnchor, coordinateBase, 'Q', ratioQuarterly, quarterlyNullReason);

  // TTM：近四季（含本季）營業費用/營收各自加總。
  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => statements.getIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );

  let expenseTtmSum = 0n;
  let revenueTtmSum = 0n;
  let ttmComplete = true;
  for (const record of ttmRecords) {
    if (record === null || record.sellingExpenses === null || record.adminExpenses === null || record.operatingRevenue === null) {
      ttmComplete = false;
    } else {
      expenseTtmSum += record.sellingExpenses + record.adminExpenses;
      revenueTtmSum += record.operatingRevenue;
    }
  }

  const ratioTtm = ttmComplete ? toPercent(expenseTtmSum, revenueTtmSum) : null;
  const ttmNullReason: MetricNullReason | null = ratioTtm !== null ? null : !ttmComplete ? 'insufficient_history' : 'zero_or_negative_denominator';

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
      nullReason: 'insufficient_history',
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  } else {
    ttm = { action: 'skipped_no_knowledge_date' };
  }

  return { symbol, rocYear: year, season, q, ttm };
};
