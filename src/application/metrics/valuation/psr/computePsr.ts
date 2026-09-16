import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { toMultipleFromThousands } from '@/domain/metrics/shared/numericHelpers';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { computation, type ComputationBatch, type ComputationSlot, noQuarterBatch } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';

// 這份檔案是 src/domainMetrics/psr.ts 的獨立重新實作——舊架構呼叫 calculateRevenuePerShare()，
// 這裡不依賴 revenuePerShare 這個 metric_code 已寫入的值，自己重新查損益表算營收。市值部分
// 直接複用 resolveKnowledgeDate 算出來的 knowledge_date 去查 getMarketCapAsOf——跟
// fcfYield/computeFcfYieldPit.ts 發現的「股價/市值不需要另外設計 knowledge_date 機制」一致，
// TTM 沿用同一次市值查詢結果。2026-09-14 應使用者要求移除單季年化（Q_ANN）節省運算——
// store/flow 比率本來就沒有單季非年化版本，只剩 TTM 一種 basis。


export type PsrDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'market'>;

export type PsrComputationBatch = ComputationBatch<'ttm'>;

export const computePsr = async (
  query: QuarterlyMetricQuery,
  deps: PsrDeps
): Promise<PsrComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return noQuarterBatch(symbol, ['ttm']);
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const incomeStatement = await deps.statements.getIncomeStatement(key);
  const reportDate = incomeStatement?.reportDate ?? null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);
  const marketCap = mainAnchor ? await deps.market.getMarketCap(symbol, mainAnchor.knowledgeDate) : null;

  const coordinateBase = { symbol, metricCode: 'psr', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  // TTM：近四季（含本季）營收加總；市值沿用上面同一筆（本季 knowledge_date 查到的），不是
  // 另外用 TTM anchor 重查一次，跟 fcfYield 的既有行為一致。
  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => deps.statements.getIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );

  let revenueTtmSum = 0n;
  let ttmComplete = true;
  for (const record of ttmRecords) {
    if (record === null || record.operatingRevenue === null) {
      ttmComplete = false;
    } else {
      revenueTtmSum += record.operatingRevenue;
    }
  }

  const psrTtm = ttmComplete && marketCap !== null ? toMultipleFromThousands(marketCap.marketCap, revenueTtmSum) : null;
  const ttmNullReason: MetricNullReason | null = psrTtm !== null ? null : ttmComplete ? (marketCap === null ? 'missing_input' : 'zero_or_negative_denominator') : 'insufficient_history';

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
        value: psrTtm,
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

  return { symbol, rocYear: year, season, slots: { ttm } };
};
