import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { absBigint } from '@/domain/metrics/shared/numericHelpers';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { type ComputationBatch, noQuarterBatch, periodSlot } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';

// Titman, Wei & Xie (2004) 異常資本投資比率——只有一個回溯窗口（前三年平均），跟
// revenueCagr 家族「同一組年度快取、拆多個回溯窗口」是同一種年度快取模式，這裡只是
// 單一窗口不需要拆多個 metric_code。資本支出來源資料是負值（現金流出），年度加總後
// 取絕對值，跟 capexToRevenue 同一種慣例。


const getAnnualCapex = async (
  cache: Map<number, bigint | null>,
  symbol: string,
  rocYear: number,
  dataType: string,
  subsidiaryCompanyId: string,
  deps: AbnormalCapexRatioDeps
): Promise<bigint | null> => {
  if (cache.has(rocYear)) return cache.get(rocYear)!;

  const quarters = await Promise.all(
    [1, 2, 3, 4].map((quarter) => deps.statements.getCashFlowStatement({ symbol, year: rocYear, quarter, dataType, subsidiaryCompanyId }))
  );
  const value = quarters.some((q) => q === null || q.capitalExpenditures === null) ? null : absBigint(quarters.reduce((sum, q) => sum + q!.capitalExpenditures!, 0n));
  cache.set(rocYear, value);
  return value;
};

export type AbnormalCapexRatioDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements'>;

export type AbnormalCapexRatioComputationBatch = ComputationBatch<'fy'>;

export const computeAbnormalCapexRatio = async (query: QuarterlyMetricQuery, deps: AbnormalCapexRatioDeps): Promise<AbnormalCapexRatioComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['cashFlowStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return noQuarterBatch(symbol, ['fy']);
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const mainCashFlowStatement = await deps.statements.getCashFlowStatement({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate: mainCashFlowStatement?.reportDate ?? null }], deps.announcements);

  const latestCompleteFiscalYear = seasonNum === 4 ? rocYear : rocYear - 1;
  const cache = new Map<number, bigint | null>();

  const currentCapex = await getAnnualCapex(cache, symbol, latestCompleteFiscalYear, dataType, subsidiaryCompanyId, deps);
  const priorCapexValues = await Promise.all(
    [1, 2, 3].map((yearsAgo) => getAnnualCapex(cache, symbol, latestCompleteFiscalYear - yearsAgo, dataType, subsidiaryCompanyId, deps))
  );

  let ciPct: number | null = null;
  let nullReason: MetricNullReason | null = null;

  if (currentCapex === null) {
    nullReason = 'missing_input';
  } else if (priorCapexValues.some((v) => v === null)) {
    nullReason = 'insufficient_history';
  } else {
    const priorAverage = priorCapexValues.reduce((sum, v) => sum! + v!, 0n) as bigint;
    if (priorAverage === 0n) {
      nullReason = 'zero_or_negative_denominator';
    } else {
      ciPct = Math.round((Number(currentCapex) / (Number(priorAverage) / 3) - 1) * 100 * 100) / 100;
    }
  }

  const coordinateBase = { symbol, metricCode: 'abnormalCapexRatio', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  const fy = periodSlot(mainAnchor, coordinateBase, 'FY', ciPct, nullReason);

  return { symbol, rocYear: year, season, slots: { fy } };
};
