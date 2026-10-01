import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { toMultipleFromThousands } from '@/domain/metrics/shared/numericHelpers';
import { rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { computation, type ComputationBatch, type ComputationSlot, noQuarterBatch, withFormulaVersion } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';
import { resolveTrailingCashFlowStatements } from '@/application/metrics/shared/trailingYear';

// 2026-09-26 formulaVersion 2：流通股數改為 IAS 33 流通在外普通股（已發行 − 特別股 − 庫藏股），EPS 類分子扣特別股股利、
// 每股淨值類分子扣特別股股本；讀股數或市值的指標一起跳版，讓下游有訊號知道值變了（使用者 2026-09-26 拍板）。
export const P_FCF_FORMULA_VERSION = 2;

// 這份檔案是 src/domainMetrics/pFcf.ts 的獨立重新實作——舊架構呼叫 calculateCashFlowPerShare()，
// 這裡不依賴 ocfPerShare/fcfPerShare 這兩個 metric_code 已寫入的值，自己重新查現金流量表算
// 自由現金流。市值查詢邏輯跟 psr/computePsrPit.ts 完全一致。沒有單季非年化版本。


export type PFcfDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'market' | 'cumulativeStatements'>;

export type PFcfComputationBatch = ComputationBatch<'ttm'>;

export const computePFcf = async (
  query: QuarterlyMetricQuery,
  deps: PFcfDeps
): Promise<PFcfComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['cashFlowStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return noQuarterBatch(symbol, ['ttm']);
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  // 2026-10-01 近一年改走共用來源（興櫃半年頻，見 shared/trailingYear.ts）。本季 reportDate 取近一年最後一段：上市櫃＝本季單季
  // 那筆（跟改版前同一筆），興櫃沒有單季現金流量表、取累計推出的那段（同一個期末日），不然興櫃的股數／市值錨點會全部落空。
  const trailing = await resolveTrailingCashFlowStatements({ symbol, rocYear, season: season as Season, dataType, subsidiaryCompanyId }, deps);
  const reportDate = trailing.periods.at(-1)?.record?.reportDate ?? null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);
  const marketCap = mainAnchor ? await deps.market.getMarketCap(symbol, mainAnchor.knowledgeDate) : null;

  const coordinateBase = { symbol, metricCode: 'pFcf', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  // TTM：近四季（含本季）自由現金流加總；市值沿用上面同一筆，不另外重查。
  const ttmQuarters = trailing.periods;
  const ttmRecords = trailing.periods.map((p) => p.record);

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
        value: pFcfTtm,
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

  return { symbol, rocYear: year, season, slots: withFormulaVersion({ ttm }, P_FCF_FORMULA_VERSION) };
};
