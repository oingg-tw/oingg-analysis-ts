import { resolveQuarterOrLatest } from '@/models/latestQuarter';
import { financialDataAdapter, type BalanceSheetPort } from '@/domainPitMetrics/shared/ports/financialDataPorts';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, periodTypeGroup } from '../../metricValueWriter';
import type { BasisOutcome, QuarterlyPitOutcomeBase } from '../../pitOutcome';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import { calculateCurrentRatio } from '@/domainPitMetrics/resilience/currentRatio/calculateCurrentRatio';
import { calculateQuickRatio } from '@/domainPitMetrics/resilience/quickRatio/calculateQuickRatio';
import { calculateCashRatio } from '@/domainPitMetrics/resilience/cashRatio/calculateCashRatio';

// 這份檔案獨立重新實作 src/domainMetrics/liquidityRatio.ts，一次查詢資產負債表，拆成三個
// 獨立 metric_code（currentRatio/quickRatio/cashRatio）——跟
// src/domainPitMetrics/shared/dupont/computeDupontFamilyPit.ts 同一種「一次查詢、拆多個 metric_code」
// 模式。三者都是純資產負債表時點快照，只有 Q 一種 basis。
//
// 2026-09-08：這個檔案本身只保留「查詢+編排+寫入」（IO 這一層）——currentRatio/quickRatio/
// cashRatio 三個 metricCode 的實際計算公式已經拆進 pitMetrics/resilience/<指標>/ 底下各自
// 的檔案，這裡只負責把查回來的原始財報數字傳給對應的 calculateXxx() 純函式、串接輸出、
// 決定 knowledge_date、呼叫 writeMetricValue。

export interface LiquidityRatioPitOutcome extends QuarterlyPitOutcomeBase {
  currentRatio: BasisOutcome;
  quickRatio: BasisOutcome;
  cashRatio: BasisOutcome;
}

export const computeAndWriteLiquidityRatioPit = async (query: QuarterlyMetricQuery, statements: BalanceSheetPort = financialDataAdapter): Promise<LiquidityRatioPitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const skippedNoQuarter: LiquidityRatioPitOutcome = {
    symbol,
    rocYear: null,
    season: null,
    currentRatio: { action: 'skipped_no_quarter' },
    quickRatio: { action: 'skipped_no_quarter' },
    cashRatio: { action: 'skipped_no_quarter' },
  };

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet']);

  if (!resolvedQuarter) return skippedNoQuarter;

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const balanceSheet = await statements.getBalanceSheet(key);
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
    currentRatio = await writeMetricValue({ ...coordinateFor('currentRatio'), ...periodTypeGroup('Q'), value: currentRatioCalc.value, nullReason: currentRatioCalc.nullReason, knowledgeDate, knowledgeDateIsFallback });
    quickRatio = await writeMetricValue({ ...coordinateFor('quickRatio'), ...periodTypeGroup('Q'), value: quickRatioCalc.value, nullReason: quickRatioCalc.nullReason, knowledgeDate, knowledgeDateIsFallback });
    cashRatio = await writeMetricValue({ ...coordinateFor('cashRatio'), ...periodTypeGroup('Q'), value: cashRatioCalc.value, nullReason: cashRatioCalc.nullReason, knowledgeDate, knowledgeDateIsFallback });
  }

  return { symbol, rocYear: year, season, currentRatio, quickRatio, cashRatio };
};
