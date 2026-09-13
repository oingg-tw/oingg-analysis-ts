import { resolveQuarterOrLatest } from '@/shared/sourceData/latestQuarter';
import { toPercent } from '@/domainPitMetrics/shared/numericHelpers';
import { financialDataAdapter, type IncomeStatementPort, type BalanceSheetPort } from '@/domainPitMetrics/shared/ports/financialDataPorts';

import { getPastNQuarters, rocYearToGregorian, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, periodTypeGroup } from '../../metricValueWriter';
import type { BasisOutcome, StandardBasisPitOutcome } from '../../pitOutcome';
import type { MetricNullReason } from '../../metricBasis';

// 量化選股盤點使用者要求新增（Novy-Marx GP/A）。分母固定用本季期末總資產，跟
// accrualsRatio/ROE/ROA 同一種「TTM 分子加總、分母用單一期末值」簡化。

const determineNullReason = (numerator: bigint | null, denominator: bigint | null): MetricNullReason => {
  if (numerator === null || denominator === null) return 'missing_input';
  return 'zero_or_negative_denominator';
};

export type NovyMarxGpToAssetsPitOutcome = StandardBasisPitOutcome;

export const computeAndWriteNovyMarxGpToAssetsPit = async (query: QuarterlyMetricQuery, statements: IncomeStatementPort & BalanceSheetPort = financialDataAdapter): Promise<NovyMarxGpToAssetsPitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet', 'incomeStatement']);

  if (!resolvedQuarter) {
    return { symbol, rocYear: null, season: null, q: { action: 'skipped_no_quarter' }, qAnn: { action: 'skipped_no_quarter' }, ttm: { action: 'skipped_no_quarter' } };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const [balanceSheet, incomeStatement] = await Promise.all([statements.getBalanceSheet(key), statements.getIncomeStatement(key)]);
  const totalAssets = balanceSheet?.totalAssets ?? null;
  const grossProfitQuarterly = incomeStatement?.grossProfit ?? null;
  const reportDate = balanceSheet?.reportDate ?? incomeStatement?.reportDate ?? null;

  const quarterlyValue = grossProfitQuarterly !== null && totalAssets !== null ? toPercent(grossProfitQuarterly, totalAssets) : null;
  const quarterlyAnnualized = quarterlyValue !== null ? Math.round(quarterlyValue * 4 * 100) / 100 : null;
  const quarterlyNullReason: MetricNullReason | null = quarterlyValue === null ? determineNullReason(grossProfitQuarterly, totalAssets) : null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);
  const coordinateBase = { symbol, metricCode: 'novyMarxGpToAssets', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  let q: BasisOutcome;
  let qAnn: BasisOutcome;
  if (!mainAnchor) {
    q = { action: 'skipped_no_knowledge_date' };
    qAnn = { action: 'skipped_no_knowledge_date' };
  } else {
    q = await writeMetricValue({
      ...coordinateBase,
      ...periodTypeGroup('Q'),
      value: quarterlyValue,
      nullReason: quarterlyNullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
    qAnn = await writeMetricValue({
      ...coordinateBase,
      ...periodTypeGroup('Q_ANN'),
      value: quarterlyAnnualized,
      nullReason: quarterlyNullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  }

  // TTM：近四季（含本季）毛利加總，分母固定用本季期末總資產。
  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => statements.getIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );

  let grossProfitTtmSum = 0n;
  let ttmComplete = true;
  for (const record of ttmRecords) {
    if (record === null || record.grossProfit === null) {
      ttmComplete = false;
    } else {
      grossProfitTtmSum += record.grossProfit;
    }
  }

  const ttmValue = ttmComplete && totalAssets !== null ? toPercent(grossProfitTtmSum, totalAssets) : null;
  const ttmNullReason: MetricNullReason | null = ttmValue !== null ? null : ttmComplete ? determineNullReason(grossProfitTtmSum, totalAssets) : 'insufficient_history';

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

  return { symbol, rocYear: year, season, q, qAnn, ttm };
};
