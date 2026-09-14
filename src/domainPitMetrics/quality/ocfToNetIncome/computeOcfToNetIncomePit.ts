import { resolveQuarterOrLatest } from '@/models/latestQuarter';
import { determineNullReason } from '@/domainPitMetrics/shared/numericHelpers';
import { pickNetIncome } from '@/domainPitMetrics/shared/pickers';
import { financialDataAdapter, type IncomeStatementPort, type CashFlowStatementPort } from '@/domainPitMetrics/shared/ports/financialDataPorts';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeOrSkip, writeMetricValue, periodTypeGroup } from '../../metricValueWriter';
import type { BasisOutcome, StandardBasisPitOutcome } from '../../pitOutcome';
import type { MetricNullReason } from '../../metricBasis';

// 這份檔案是 src/domainMetrics/ocfToNetIncome.ts 的獨立重新實作。沒有 Q_ANN——flow/flow
// 比率年化沒有意義，跟 netProfitMargin 同一種規則。

// 單位是「倍」，不是百分比。
const toRatio = (numerator: bigint, denominator: bigint): number | null => {
  if (denominator === 0n) return null;
  return Math.round((Number(numerator) / Number(denominator)) * 100) / 100;
};

export type OcfToNetIncomePitOutcome = StandardBasisPitOutcome;

export const computeAndWriteOcfToNetIncomePit = async (
  query: QuarterlyMetricQuery,
  statements: IncomeStatementPort & CashFlowStatementPort = financialDataAdapter
): Promise<OcfToNetIncomePitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement', 'cashFlowStatement']);

  if (!resolvedQuarter) {
    return { symbol, rocYear: null, season: null, q: { action: 'skipped_no_quarter' }, ttm: { action: 'skipped_no_quarter' } };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const [incomeStatement, cashFlowStatement] = await Promise.all([statements.getIncomeStatement(key), statements.getCashFlowStatement(key)]);
  const netIncome = pickNetIncome(incomeStatement);
  const operatingCashFlow = cashFlowStatement?.netCashFromOperatingActivities ?? null;
  const reportDate = incomeStatement?.reportDate ?? cashFlowStatement?.reportDate ?? null;

  const quarterly = operatingCashFlow !== null && netIncome.value !== null ? toRatio(operatingCashFlow, netIncome.value) : null;
  const quarterlyNullReason: MetricNullReason | null = quarterly === null ? determineNullReason(operatingCashFlow, netIncome.value) : null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);
  const coordinateBase = { symbol, metricCode: 'ocfToNetIncome', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  const q = await writeOrSkip(mainAnchor, coordinateBase, 'Q', quarterly, quarterlyNullReason);

  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) =>
      Promise.all([
        statements.getIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }),
        statements.getCashFlowStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }),
      ])
    )
  );

  let netIncomeTtmSum = 0n;
  let ocfTtmSum = 0n;
  let ttmComplete = true;
  for (const [incomeRecord, cashFlowRecord] of ttmRecords) {
    const picked = pickNetIncome(incomeRecord);
    if (picked.value === null || cashFlowRecord === null || cashFlowRecord.netCashFromOperatingActivities === null) {
      ttmComplete = false;
    } else {
      netIncomeTtmSum += picked.value;
      ocfTtmSum += cashFlowRecord.netCashFromOperatingActivities;
    }
  }

  const ttmValue = ttmComplete ? toRatio(ocfTtmSum, netIncomeTtmSum) : null;
  const ttmNullReason: MetricNullReason | null = ttmValue !== null ? null : ttmComplete ? determineNullReason(ocfTtmSum, netIncomeTtmSum) : 'insufficient_history';

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

  return { symbol, rocYear: year, season, q, ttm };
};
