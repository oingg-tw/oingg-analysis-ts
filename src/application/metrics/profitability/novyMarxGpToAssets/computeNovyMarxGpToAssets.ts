import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { determineNullReason, toPercent } from '@/domain/metrics/shared/numericHelpers';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { computation, type ComputationBatch, type ComputationSlot, noQuarterBatch, periodSlot } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';

// 量化選股盤點使用者要求新增（Novy-Marx GP/A）。分母固定用本季期末總資產，跟
// accrualsRatio/ROE/ROA 同一種「TTM 分子加總、分母用單一期末值」簡化。


export type NovyMarxGpToAssetsDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements'>;

export type NovyMarxGpToAssetsComputationBatch = ComputationBatch<'q' | 'ttm'>;

export const computeNovyMarxGpToAssets = async (query: QuarterlyMetricQuery, deps: NovyMarxGpToAssetsDeps): Promise<NovyMarxGpToAssetsComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet', 'incomeStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return noQuarterBatch(symbol, ['q', 'ttm']);
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const [balanceSheet, incomeStatement] = await Promise.all([deps.statements.getBalanceSheet(key), deps.statements.getIncomeStatement(key)]);
  const totalAssets = balanceSheet?.totalAssets ?? null;
  const grossProfitQuarterly = incomeStatement?.grossProfit ?? null;
  const reportDate = balanceSheet?.reportDate ?? incomeStatement?.reportDate ?? null;

  const quarterlyValue = grossProfitQuarterly !== null && totalAssets !== null ? toPercent(grossProfitQuarterly, totalAssets) : null;
  const quarterlyNullReason: MetricNullReason | null = quarterlyValue === null ? determineNullReason(grossProfitQuarterly, totalAssets) : null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);
  const coordinateBase = { symbol, metricCode: 'novyMarxGpToAssets', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  const q = periodSlot(mainAnchor, coordinateBase, 'Q', quarterlyValue, quarterlyNullReason);

  // TTM：近四季（含本季）毛利加總，分母固定用本季期末總資產。
  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => deps.statements.getIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
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

  let ttm: ComputationSlot;
  if (ttmComplete) {
    const ttmAnchor = await resolveKnowledgeDate(
      symbol,
      ttmQuarters.map((tq, i) => ({ rocYear: Number(tq.year), season: Number(tq.season), reportDate: ttmRecords[i]?.reportDate ?? null })), deps.announcements
    );
    if (!ttmAnchor) {
      ttm = { action: 'skipped_no_knowledge_date' };
    } else {
      ttm = computation({
        ...coordinateBase,
        ...periodTypeGroup('TTM'),
        value: ttmValue,
        nullReason: ttmNullReason,
        knowledgeDate: ttmAnchor.knowledgeDate,
        knowledgeDateIsFallback: ttmAnchor.isFallback,
      });
    }
  } else if (mainAnchor) {
    ttm = computation({
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

  return { symbol, rocYear: year, season, slots: { q, ttm } };
};
