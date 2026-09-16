import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import { calculateCurrentRatio } from '@/domain/metrics/resilience/currentRatio/calculateCurrentRatio';
import { calculateQuickRatio } from '@/domain/metrics/resilience/quickRatio/calculateQuickRatio';
import { calculateCashRatio } from '@/domain/metrics/resilience/cashRatio/calculateCashRatio';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { computation, type ComputationBatch, type ComputationSlot, noQuarterBatch } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';

// 這份檔案獨立重新實作 src/domainMetrics/liquidityRatio.ts，一次查詢資產負債表，拆成三個
// 獨立 metric_code（currentRatio/quickRatio/cashRatio）——跟
// src/domainPitMetrics/shared/dupont/computeDupontFamilyPit.ts 同一種「一次查詢、拆多個 metric_code」
// 模式。三者都是純資產負債表時點快照，只有 Q 一種 basis。
//
// 2026-09-08：這個檔案本身只保留「查詢+編排+寫入」（IO 這一層）——currentRatio/quickRatio/
// cashRatio 三個 metricCode 的實際計算公式已經拆進 pitMetrics/resilience/<指標>/ 底下各自
// 的檔案，這裡只負責把查回來的原始財報數字傳給對應的 calculateXxx() 純函式、串接輸出、
// 決定 knowledge_date、呼叫 writeMetricValue。


export type LiquidityRatioDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements'>;

export type LiquidityRatioComputationBatch = ComputationBatch<'currentRatio' | 'quickRatio' | 'cashRatio'>;

export const computeLiquidityRatio = async (query: QuarterlyMetricQuery, deps: LiquidityRatioDeps): Promise<LiquidityRatioComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const skippedNoQuarter: LiquidityRatioComputationBatch = noQuarterBatch(symbol, ['currentRatio', 'quickRatio', 'cashRatio']);

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet'], deps.quarters);

  if (!resolvedQuarter) return skippedNoQuarter;

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const balanceSheet = await deps.statements.getBalanceSheet(key);
  const currentAssets = balanceSheet?.currentAssets ?? null;
  const currentLiabilities = balanceSheet?.currentLiabilities ?? null;
  const inventory = balanceSheet?.inventory ?? null;
  const cashAndEquivalents = balanceSheet?.cashAndEquivalents ?? null;
  const reportDate = balanceSheet?.reportDate ?? null;

  const currentRatioCalc = calculateCurrentRatio(currentAssets, currentLiabilities);
  const quickRatioCalc = calculateQuickRatio(currentAssets, inventory, currentLiabilities);
  const cashRatioCalc = calculateCashRatio(cashAndEquivalents, currentLiabilities);

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);
  const coordinateFor = (metricCode: string) => ({ symbol, metricCode, fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId });

  let currentRatio: ComputationSlot;
  let quickRatio: ComputationSlot;
  let cashRatio: ComputationSlot;

  if (!mainAnchor) {
    currentRatio = { action: 'skipped_no_knowledge_date' };
    quickRatio = { action: 'skipped_no_knowledge_date' };
    cashRatio = { action: 'skipped_no_knowledge_date' };
  } else {
    const { knowledgeDate, isFallback: knowledgeDateIsFallback } = mainAnchor;
    currentRatio = computation({ ...coordinateFor('currentRatio'), ...periodTypeGroup('Q'), value: currentRatioCalc.value, nullReason: currentRatioCalc.nullReason, knowledgeDate, knowledgeDateIsFallback });
    quickRatio = computation({ ...coordinateFor('quickRatio'), ...periodTypeGroup('Q'), value: quickRatioCalc.value, nullReason: quickRatioCalc.nullReason, knowledgeDate, knowledgeDateIsFallback });
    cashRatio = computation({ ...coordinateFor('cashRatio'), ...periodTypeGroup('Q'), value: cashRatioCalc.value, nullReason: cashRatioCalc.nullReason, knowledgeDate, knowledgeDateIsFallback });
  }

  return { symbol, rocYear: year, season, slots: { currentRatio, quickRatio, cashRatio } };
};
