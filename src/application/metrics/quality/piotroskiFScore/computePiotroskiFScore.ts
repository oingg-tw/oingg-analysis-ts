import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { pickNetIncome } from '@/domain/metrics/shared/pickers';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { computation, type ComputationBatch, type ComputationSlot, noQuarterBatch } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';

// 這份檔案是 src/domainMetrics/piotroskiFScore.ts 的獨立重新實作。9 個二元訊號本季 vs
// 去年同季比較——去年同季用 getPastNQuarters({rocYear,season},5)[0]（5 季前，取最舊那一筆）
// 取得，不是專門的新機制，是既有 getPastNQuarters 的另一種用法。只有 Q 一種 basis，純粹
// 單點比較，沒有 TTM/年化概念。9 個訊號本身不拆成獨立 metric_code——2026-09-10 web-nuxt
// 要求依 Piotroski 原始論文的分組（獲利能力/財務槓桿與流動性/營運效率）顯示，改成用
// resolvePiotroskiFScoreSignals() 共用計算邏輯，寫入路徑（computeAndWritePiotroskiFScorePit）
// 跟 on-demand 讀取路徑（getPiotroskiFScoreBreakdown，見 getPiotroskiFScoreBreakdown.ts）
// 各自呼叫同一份計算，不重複寫兩次；9 個訊號本身依然不寫進 metric_values，breakdown 端點
// 現查現算。

const ratio = (numerator: bigint | null, denominator: bigint | null): number | null => {
  if (numerator === null || denominator === null || denominator === 0n) return null;
  return Number(numerator) / Number(denominator);
};

interface QuarterData {
  totalAssets: bigint | null;
  longTermBorrowings: bigint | null;
  currentAssets: bigint | null;
  currentLiabilities: bigint | null;
  netIncome: bigint | null;
  grossProfit: bigint | null;
  operatingRevenue: bigint | null;
  operatingCashFlow: bigint | null;
  paidInShares: bigint | null;
  reportDate: Date | null;
  available: boolean; // 三張表是否至少都存在（不論欄位是否為 null）
}

const fetchQuarterData = async (
  symbol: string,
  rocYear: number,
  season: number,
  dataType: string,
  subsidiaryCompanyId: string,
  deps: PiotroskiFScoreDeps
): Promise<QuarterData> => {
  const key = { symbol, year: rocYear, quarter: season, dataType, subsidiaryCompanyId };
  const [balanceSheet, incomeStatement, cashFlowStatement] = await Promise.all([
    deps.statements.getBalanceSheet(key),
    deps.statements.getIncomeStatement(key),
    deps.statements.getCashFlowStatement(key),
  ]);
  const reportDate = balanceSheet?.reportDate ?? incomeStatement?.reportDate ?? cashFlowStatement?.reportDate ?? null;
  const shares = reportDate ? await deps.shares.getPaidInShares(symbol, reportDate) : null;

  return {
    totalAssets: balanceSheet?.totalAssets ?? null,
    longTermBorrowings: balanceSheet?.longTermBorrowings ?? null,
    currentAssets: balanceSheet?.currentAssets ?? null,
    currentLiabilities: balanceSheet?.currentLiabilities ?? null,
    netIncome: pickNetIncome(incomeStatement).value,
    grossProfit: incomeStatement?.grossProfit ?? null,
    operatingRevenue: incomeStatement?.operatingRevenue ?? null,
    operatingCashFlow: cashFlowStatement?.netCashFromOperatingActivities ?? null,
    paidInShares: shares?.paidInShares ?? null,
    reportDate,
    available: balanceSheet !== null && incomeStatement !== null && cashFlowStatement !== null,
  };
};


// 9 個二元訊號，命名/順序跟 Piotroski (2000) 原始論文一致，見 getPiotroskiFScoreBreakdown.ts
// 依這個順序分成「獲利能力（前4）/財務槓桿與流動性（中3）/營運效率（後2）」三組。
export interface PiotroskiFScoreSignals {
  positiveRoa: boolean | null;
  positiveCfo: boolean | null;
  roaImproved: boolean | null;
  accrualQuality: boolean | null;
  leverageDecreased: boolean | null;
  liquidityImproved: boolean | null;
  noDilution: boolean | null;
  grossMarginImproved: boolean | null;
  assetTurnoverImproved: boolean | null;
}

export interface PiotroskiFScoreResolution {
  symbol: string;
  rocYear: string;
  season: string;
  fiscalYear: number;
  fiscalQuarter: number;
  signals: PiotroskiFScoreSignals;
  score: number | null;
  nullReason: MetricNullReason | null;
  knowledgeDate: Date | null;
  knowledgeDateIsFallback: boolean | null;
}

// 共用計算邏輯——寫入路徑（computeAndWritePiotroskiFScorePit）跟 on-demand 讀取路徑
// （getPiotroskiFScoreBreakdown）各自呼叫，避免兩處各自維護一份 9 訊號計算邏輯。
// resolvedQuarter 查無資料時回傳 null，呼叫端各自決定怎麼呈現「查無資料」。
export const resolvePiotroskiFScoreSignals = async (
  query: QuarterlyMetricQuery,
  deps: PiotroskiFScoreDeps
): Promise<PiotroskiFScoreResolution | null> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet', 'incomeStatement', 'cashFlowStatement'], deps.quarters);

  if (!resolvedQuarter) return null;

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const prior = getPastNQuarters({ rocYear, season: season as Season }, 5)[0]!;
  const priorRocYear = Number(prior.year);
  const priorSeasonNum = Number(prior.season);

  const [curr, prev] = await Promise.all([
    fetchQuarterData(symbol, rocYear, seasonNum, dataType, subsidiaryCompanyId, deps),
    fetchQuarterData(symbol, priorRocYear, priorSeasonNum, dataType, subsidiaryCompanyId, deps),
  ]);

  const currRoa = ratio(curr.netIncome, curr.totalAssets);
  const prevRoa = ratio(prev.netIncome, prev.totalAssets);
  const currLeverage = ratio(curr.longTermBorrowings ?? 0n, curr.totalAssets);
  const prevLeverage = ratio(prev.longTermBorrowings ?? 0n, prev.totalAssets);
  const currLiquidity = ratio(curr.currentAssets, curr.currentLiabilities);
  const prevLiquidity = ratio(prev.currentAssets, prev.currentLiabilities);
  const currMargin = ratio(curr.grossProfit, curr.operatingRevenue);
  const prevMargin = ratio(prev.grossProfit, prev.operatingRevenue);
  const currTurnover = ratio(curr.operatingRevenue, curr.totalAssets);
  const prevTurnover = ratio(prev.operatingRevenue, prev.totalAssets);

  const signals: PiotroskiFScoreSignals = {
    positiveRoa: currRoa !== null ? currRoa > 0 : null,
    positiveCfo: curr.operatingCashFlow !== null ? curr.operatingCashFlow > 0n : null,
    roaImproved: currRoa !== null && prevRoa !== null ? currRoa > prevRoa : null,
    accrualQuality: curr.operatingCashFlow !== null && curr.netIncome !== null ? curr.operatingCashFlow > curr.netIncome : null,
    leverageDecreased: currLeverage !== null && prevLeverage !== null ? currLeverage < prevLeverage : null,
    liquidityImproved: currLiquidity !== null && prevLiquidity !== null ? currLiquidity > prevLiquidity : null,
    noDilution: curr.paidInShares !== null && prev.paidInShares !== null ? curr.paidInShares <= prev.paidInShares : null,
    grossMarginImproved: currMargin !== null && prevMargin !== null ? currMargin > prevMargin : null,
    assetTurnoverImproved: currTurnover !== null && prevTurnover !== null ? currTurnover > prevTurnover : null,
  };

  const signalValues = Object.values(signals);
  const allEvaluated = signalValues.every((s) => s !== null);
  const score = allEvaluated ? signalValues.reduce((sum: number, s) => sum + (s ? 1 : 0), 0) : null;

  let nullReason: MetricNullReason | null = null;
  if (score === null) {
    nullReason = !prev.available ? 'insufficient_history' : 'missing_input';
  }

  const mainAnchor = await resolveKnowledgeDate(symbol, [
    { rocYear, season: seasonNum, reportDate: curr.reportDate },
    { rocYear: priorRocYear, season: priorSeasonNum, reportDate: prev.reportDate },
  ], deps.announcements);

  return {
    symbol,
    rocYear: year,
    season,
    fiscalYear,
    fiscalQuarter: seasonNum,
    signals,
    score,
    nullReason,
    knowledgeDate: mainAnchor?.knowledgeDate ?? null,
    knowledgeDateIsFallback: mainAnchor?.isFallback ?? null,
  };
};

export type PiotroskiFScoreDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'shares'>;

export type PiotroskiFScoreComputationBatch = ComputationBatch<'q'>;

export const computePiotroskiFScore = async (
  query: QuarterlyMetricQuery,
  deps: PiotroskiFScoreDeps
): Promise<PiotroskiFScoreComputationBatch> => {
  const resolution = await resolvePiotroskiFScoreSignals(query, deps);

  if (!resolution) {
    return noQuarterBatch(query.symbol, ['q']);
  }

  const { symbol, rocYear, season, fiscalYear, fiscalQuarter, score, nullReason, knowledgeDate, knowledgeDateIsFallback } = resolution;

  let q: ComputationSlot;
  if (!knowledgeDate) {
    q = { action: 'skipped_no_knowledge_date' };
  } else {
    q = computation({
      symbol,
      metricCode: 'piotroskiFScore',
      fiscalYear,
      fiscalQuarter,
      dataType: query.dataType,
      subsidiaryCompanyId: query.subsidiaryCompanyId,
      ...periodTypeGroup('Q'),
      value: score,
      nullReason,
      knowledgeDate,
      knowledgeDateIsFallback: knowledgeDateIsFallback!,
    });
  }

  return { symbol, rocYear, season, slots: { q } };
};
