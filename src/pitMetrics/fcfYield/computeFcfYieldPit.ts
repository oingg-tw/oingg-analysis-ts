import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getCashFlowStatementXbrlFirst as getQuarterlyCashFlowStatement } from '@/shared/sourceData/cashFlowStatementXbrlFirst';
import { getPaidInSharesAsOf } from '@/shared/sourceData/capitalStock';
import { getStockPriceAsOf } from '@/shared/sourceData/marketCap';
import { getPastNQuarters, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../knowledgeDate';
import { rocYearToGregorian } from '../rocYear';
import { writeMetricValue, type MetricValueWriteOutcome } from '../metricValueWriter';
import type { MetricNullReason } from '../metricBasis';

// 這份檔案獨立重新實作 src/domainMetrics/fcfYield.ts——舊架構呼叫 calculateCashFlowPerShare()，
// 這裡不依賴 ocfPerShare/fcfPerShare 這兩個 metric_code 已寫入的值，自己重新查現金流量表 +
// 股本歷史算每股 FCF。股價部分直接複用 resolveKnowledgeDate 算出來的 knowledge_date 去查
// getStockPriceAsOf——這是這批遷移的重要發現：舊架構原本呼叫的 getPriceAnchorDate 跟
// resolveKnowledgeDate 底層用的是同一支函式，不需要另外設計「股價要取哪一天」的新機制。
// 跟舊架構一致：Q_ANN/TTM 的股價都用「本季」這組 knowledge_date 查一次，不是各自獨立解析。
// 沒有單季非年化版本（P_FCF 估值倍數的倒數）。

const toPerShare = (numeratorInThousands: bigint, shares: bigint): number | null => {
  if (shares === 0n) return null;
  return Math.round(((Number(numeratorInThousands) * 1000) / Number(shares)) * 100) / 100;
};

const toPctFromNumbers = (numerator: number, denominator: number): number | null => {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 100 * 100) / 100;
};

type BasisOutcome = MetricValueWriteOutcome | { action: 'skipped_no_knowledge_date' } | { action: 'skipped_no_quarter' };

export interface FcfYieldPitOutcome {
  symbol: string;
  rocYear: string | null;
  season: string | null;
  qAnn: BasisOutcome;
  ttm: BasisOutcome;
}

export const computeAndWriteFcfYieldPit = async (query: QuarterlyMetricQuery): Promise<FcfYieldPitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['cashFlowStatement']);

  if (!resolvedQuarter) {
    return { symbol, rocYear: null, season: null, qAnn: { action: 'skipped_no_quarter' }, ttm: { action: 'skipped_no_quarter' } };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const cashFlowStatement = await getQuarterlyCashFlowStatement(key);
  const operatingCashFlow = cashFlowStatement?.netCashFromOperatingActivities ?? null;
  const capitalExpenditures = cashFlowStatement?.capitalExpenditures ?? null;
  const reportDate = cashFlowStatement?.reportDate ?? null;
  const currentFcf = operatingCashFlow !== null && capitalExpenditures !== null ? operatingCashFlow + capitalExpenditures : null;

  const shares = reportDate ? await getPaidInSharesAsOf(symbol, reportDate) : null;
  const sharesValue = shares?.paidInShares ?? null;

  const fcfPerShareQuarterly = currentFcf !== null && sharesValue !== null ? toPerShare(currentFcf, sharesValue) : null;
  const fcfPerShareQuarterlyAnnualized = fcfPerShareQuarterly !== null ? Math.round(fcfPerShareQuarterly * 4 * 100) / 100 : null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);
  const stockPrice = mainAnchor ? await getStockPriceAsOf(symbol, mainAnchor.knowledgeDate) : null;

  const fcfYieldQuarterlyAnnualizedPct =
    fcfPerShareQuarterlyAnnualized !== null && stockPrice !== null ? toPctFromNumbers(fcfPerShareQuarterlyAnnualized, stockPrice.closePrice) : null;
  const qAnnNullReason: MetricNullReason | null = fcfYieldQuarterlyAnnualizedPct === null ? 'missing_input' : null;

  const coordinateBase = { symbol, metricCode: 'fcfYield', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  let qAnn: BasisOutcome;
  if (!mainAnchor) {
    qAnn = { action: 'skipped_no_knowledge_date' };
  } else {
    qAnn = await writeMetricValue({
      ...coordinateBase,
      basis: 'Q_ANN',
      value: fcfYieldQuarterlyAnnualizedPct,
      nullReason: qAnnNullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  }

  // TTM：近四季（含本季）FCF 加總 / 流通股數；股價沿用上面同一筆（本季 knowledge_date 查到的），
  // 不是另外用 TTM anchor 重查一次，跟 fcfYield.ts 的既有行為一致。
  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => getQuarterlyCashFlowStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
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

  const fcfPerShareTtm = ttmComplete && sharesValue !== null ? toPerShare(fcfTtmSum, sharesValue) : null;
  const fcfYieldTtmPct = fcfPerShareTtm !== null && stockPrice !== null ? toPctFromNumbers(fcfPerShareTtm, stockPrice.closePrice) : null;
  const ttmNullReason: MetricNullReason | null = fcfYieldTtmPct !== null ? null : ttmComplete ? 'missing_input' : 'insufficient_history';

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
        basis: 'TTM',
        value: fcfYieldTtmPct,
        nullReason: ttmNullReason,
        knowledgeDate: ttmAnchor.knowledgeDate,
        knowledgeDateIsFallback: ttmAnchor.isFallback,
      });
    }
  } else if (mainAnchor) {
    ttm = await writeMetricValue({
      ...coordinateBase,
      basis: 'TTM',
      value: null,
      nullReason: 'insufficient_history',
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  } else {
    ttm = { action: 'skipped_no_knowledge_date' };
  }

  return { symbol, rocYear: year, season, qAnn, ttm };
};
