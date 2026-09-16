import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { toMultipleFromThousands } from '@/domain/metrics/shared/numericHelpers';
import { financialDataAdapter, type CashFlowStatementPort, type MarketCapPort } from '@/application/metrics/shared/ports/financialDataPorts';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, periodTypeGroup } from '../../metricValueWriter';
import type { BasisOutcome, StandardBasisPitOutcome } from '../../pitOutcome';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';

// 這份檔案是 src/domainMetrics/pFcf.ts 的獨立重新實作——舊架構呼叫 calculateCashFlowPerShare()，
// 這裡不依賴 ocfPerShare/fcfPerShare 這兩個 metric_code 已寫入的值，自己重新查現金流量表算
// 自由現金流。市值查詢邏輯跟 psr/computePsrPit.ts 完全一致。沒有單季非年化版本。

export type PFcfPitOutcome = StandardBasisPitOutcome;

export const computeAndWritePFcfPit = async (
  query: QuarterlyMetricQuery,
  statements: CashFlowStatementPort & MarketCapPort = financialDataAdapter
): Promise<PFcfPitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['cashFlowStatement']);

  if (!resolvedQuarter) {
    return { symbol, rocYear: null, season: null, ttm: { action: 'skipped_no_quarter' } };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const cashFlowStatement = await statements.getCashFlowStatement(key);
  const reportDate = cashFlowStatement?.reportDate ?? null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);
  const marketCap = mainAnchor ? await statements.getMarketCap(symbol, mainAnchor.knowledgeDate) : null;

  const coordinateBase = { symbol, metricCode: 'pFcf', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  // TTM：近四季（含本季）自由現金流加總；市值沿用上面同一筆，不另外重查。
  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => statements.getCashFlowStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );

  let fcfTtmSum = 0n;
  let ttmComplete = true;
  for (const record of ttmRecords) {
    if (record === null || record.netCashFromOperatingActivities === null || record.capitalExpenditures === null) {
      ttmComplete = false;
    } else {
      fcfTtmSum += record.netCashFromOperatingActivities + record.capitalExpenditures;
    }
  }

  const pFcfTtm = ttmComplete && marketCap !== null ? toMultipleFromThousands(marketCap.marketCap, fcfTtmSum) : null;
  const ttmNullReason: MetricNullReason | null = pFcfTtm !== null ? null : ttmComplete ? (marketCap === null ? 'missing_input' : 'zero_or_negative_denominator') : 'insufficient_history';

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
        value: pFcfTtm,
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

  return { symbol, rocYear: year, season, ttm };
};
