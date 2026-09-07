import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getBalanceSheetXbrlFirst as getQuarterlyBalanceSheet } from '@/shared/sourceData/balanceSheetXbrlFirst';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, type MetricValueWriteOutcome } from '../../metricValueWriter';
import type { MetricNullReason } from '../../metricBasis';
import { rocYearToGregorian } from '@/shared/rocQuarter';

// 這份檔案獨立重新實作 src/domainMetrics/liquidityRatio.ts，一次查詢資產負債表，拆成三個
// 獨立 metric_code（currentRatio/quickRatio/cashRatio）——跟
// src/pitMetrics/shared/dupont/computeDupontFamilyPit.ts 同一種「一次查詢、拆多個 metric_code」
// 模式。三者都是純資產負債表時點快照，只有 Q 一種 basis。

const toPct = (numerator: bigint, denominator: bigint): number | null => {
  if (denominator === 0n) return null;
  return Math.round((Number(numerator) / Number(denominator)) * 100 * 100) / 100;
};

const determineNullReason = (numerator: bigint | null, denominator: bigint | null): MetricNullReason => {
  if (numerator === null || denominator === null) return 'missing_input';
  return 'zero_or_negative_denominator';
};

type BasisOutcome = MetricValueWriteOutcome | { action: 'skipped_no_knowledge_date' } | { action: 'skipped_no_quarter' };

export interface LiquidityRatioPitOutcome {
  symbol: string;
  rocYear: string | null;
  season: string | null;
  currentRatio: BasisOutcome;
  quickRatio: BasisOutcome;
  cashRatio: BasisOutcome;
}

export const computeAndWriteLiquidityRatioPit = async (query: QuarterlyMetricQuery): Promise<LiquidityRatioPitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const skippedNoQuarter: LiquidityRatioPitOutcome = {
    symbol,
    rocYear: null,
    season: null,
    currentRatio: { action: 'skipped_no_quarter' },
    quickRatio: { action: 'skipped_no_quarter' },
    cashRatio: { action: 'skipped_no_quarter' },
  };

  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['balanceSheet']);

  if (!resolvedQuarter) return skippedNoQuarter;

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const balanceSheet = await getQuarterlyBalanceSheet(key);
  const currentAssets = balanceSheet?.currentAssets ?? null;
  const currentLiabilities = balanceSheet?.currentLiabilities ?? null;
  const inventory = balanceSheet?.inventory ?? null;
  const cashAndEquivalents = balanceSheet?.cashAndEquivalents ?? null;
  const reportDate = balanceSheet?.reportDate ?? null;

  const currentRatioPct = currentAssets !== null && currentLiabilities !== null ? toPct(currentAssets, currentLiabilities) : null;
  const currentRatioNullReason: MetricNullReason | null = currentRatioPct === null ? determineNullReason(currentAssets, currentLiabilities) : null;

  const quickAssets = currentAssets !== null && inventory !== null ? currentAssets - inventory : null;
  const quickRatioPct = quickAssets !== null && currentLiabilities !== null ? toPct(quickAssets, currentLiabilities) : null;
  const quickRatioNullReason: MetricNullReason | null = quickRatioPct === null ? determineNullReason(quickAssets, currentLiabilities) : null;

  const cashRatioPct = cashAndEquivalents !== null && currentLiabilities !== null ? toPct(cashAndEquivalents, currentLiabilities) : null;
  const cashRatioNullReason: MetricNullReason | null = cashRatioPct === null ? determineNullReason(cashAndEquivalents, currentLiabilities) : null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);
  const coordinateFor = (metricCode: string) => ({ symbol, metricCode, fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId });

  let currentRatio: BasisOutcome;
  let quickRatio: BasisOutcome;
  let cashRatio: BasisOutcome;

  if (!mainAnchor) {
    currentRatio = { action: 'skipped_no_knowledge_date' };
    quickRatio = { action: 'skipped_no_knowledge_date' };
    cashRatio = { action: 'skipped_no_knowledge_date' };
  } else {
    const { knowledgeDate, isFallback: knowledgeDateIsFallback } = mainAnchor;
    currentRatio = await writeMetricValue({ ...coordinateFor('currentRatio'), basis: 'Q', value: currentRatioPct, nullReason: currentRatioNullReason, knowledgeDate, knowledgeDateIsFallback });
    quickRatio = await writeMetricValue({ ...coordinateFor('quickRatio'), basis: 'Q', value: quickRatioPct, nullReason: quickRatioNullReason, knowledgeDate, knowledgeDateIsFallback });
    cashRatio = await writeMetricValue({ ...coordinateFor('cashRatio'), basis: 'Q', value: cashRatioPct, nullReason: cashRatioNullReason, knowledgeDate, knowledgeDateIsFallback });
  }

  return { symbol, rocYear: year, season, currentRatio, quickRatio, cashRatio };
};
