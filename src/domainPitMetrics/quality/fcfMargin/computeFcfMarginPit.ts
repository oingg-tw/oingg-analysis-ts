import { resolveQuarterOrLatest } from '@/shared/sourceData/latestQuarter';
import { determineNullReason, toPercent } from '@/domainPitMetrics/shared/numericHelpers';
import { financialDataAdapter, type IncomeStatementPort, type CashFlowStatementPort } from '@/domainPitMetrics/shared/ports/financialDataPorts';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, periodTypeGroup } from '../../metricValueWriter';
import type { BasisOutcome, StandardBasisPitOutcome } from '../../pitOutcome';
import type { MetricNullReason } from '../../metricBasis';

// 量化選股盤點使用者要求新增。自由現金流 = 營業活動現金流 + 投資性資本支出
// （capitalExpenditures 現金流量表原始科目已是負數），跟 ocfPerShare/fcfPerShare 同一套
// FCF 定義，獨立重新計算不依賴其已寫入的值。只有 TTM 一種 basis。

export type FcfMarginPitOutcome = StandardBasisPitOutcome;

export const computeAndWriteFcfMarginPit = async (query: QuarterlyMetricQuery, statements: IncomeStatementPort & CashFlowStatementPort = financialDataAdapter): Promise<FcfMarginPitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement', 'cashFlowStatement']);

  if (!resolvedQuarter) {
    return { symbol, rocYear: null, season: null, ttm: { action: 'skipped_no_quarter' } };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) =>
      Promise.all([
        statements.getIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }),
        statements.getCashFlowStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }),
      ])
    )
  );

  let revenueTtmSum = 0n;
  let fcfTtmSum = 0n;
  let ttmComplete = true;
  for (const [incomeRecord, cashFlowRecord] of ttmRecords) {
    if (
      incomeRecord === null ||
      cashFlowRecord === null ||
      incomeRecord.operatingRevenue === null ||
      cashFlowRecord.netCashFromOperatingActivities === null ||
      cashFlowRecord.capitalExpenditures === null
    ) {
      ttmComplete = false;
    } else {
      revenueTtmSum += incomeRecord.operatingRevenue;
      fcfTtmSum += cashFlowRecord.netCashFromOperatingActivities + cashFlowRecord.capitalExpenditures;
    }
  }

  const ttmValue = ttmComplete ? toPercent(fcfTtmSum, revenueTtmSum) : null;
  const ttmNullReason: MetricNullReason | null = ttmValue !== null ? null : ttmComplete ? determineNullReason(fcfTtmSum, revenueTtmSum) : 'insufficient_history';

  const coordinateBase = { symbol, metricCode: 'fcfMargin', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

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
  } else {
    const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
    const currentIncome = await statements.getIncomeStatement(key);
    const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate: currentIncome?.reportDate ?? null }]);
    if (!mainAnchor) {
      ttm = { action: 'skipped_no_knowledge_date' };
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
  }

  return { symbol, rocYear: year, season, ttm };
};
