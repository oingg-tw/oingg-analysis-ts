import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getBalanceSheetXbrlFirst as getQuarterlyBalanceSheet } from '@/shared/sourceData/balanceSheetXbrlFirst';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, type MetricValueWriteOutcome } from '../../metricValueWriter';
import { rocYearToGregorian } from '@/shared/rocQuarter';
import { calculateCurrentRatio } from '@/pitMetrics/resilience/currentRatio/calculateCurrentRatio';
import { calculateQuickRatio } from '@/pitMetrics/resilience/quickRatio/calculateQuickRatio';
import { calculateCashRatio } from '@/pitMetrics/resilience/cashRatio/calculateCashRatio';

// 這份檔案獨立重新實作 src/domainMetrics/liquidityRatio.ts，一次查詢資產負債表，拆成三個
// 獨立 metric_code（currentRatio/quickRatio/cashRatio）——跟
// src/pitMetrics/shared/dupont/computeDupontFamilyPit.ts 同一種「一次查詢、拆多個 metric_code」
// 模式。三者都是純資產負債表時點快照，只有 Q 一種 basis。
//
// 2026-09-08：這個檔案本身只保留「查詢+編排+寫入」（IO 這一層）——currentRatio/quickRatio/
// cashRatio 三個 metricCode 的實際計算公式已經拆進 pitMetrics/resilience/<指標>/ 底下各自
// 的檔案，這裡只負責把查回來的原始財報數字傳給對應的 calculateXxx() 純函式、串接輸出、
// 決定 knowledge_date、呼叫 writeMetricValue。

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

  const currentRatioCalc = calculateCurrentRatio(currentAssets, currentLiabilities);
  const quickRatioCalc = calculateQuickRatio(currentAssets, inventory, currentLiabilities);
  const cashRatioCalc = calculateCashRatio(cashAndEquivalents, currentLiabilities);

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
    currentRatio = await writeMetricValue({ ...coordinateFor('currentRatio'), basis: 'Q', value: currentRatioCalc.value, nullReason: currentRatioCalc.nullReason, knowledgeDate, knowledgeDateIsFallback });
    quickRatio = await writeMetricValue({ ...coordinateFor('quickRatio'), basis: 'Q', value: quickRatioCalc.value, nullReason: quickRatioCalc.nullReason, knowledgeDate, knowledgeDateIsFallback });
    cashRatio = await writeMetricValue({ ...coordinateFor('cashRatio'), basis: 'Q', value: cashRatioCalc.value, nullReason: cashRatioCalc.nullReason, knowledgeDate, knowledgeDateIsFallback });
  }

  return { symbol, rocYear: year, season, currentRatio, quickRatio, cashRatio };
};
